/* exported enable, disable, init, main */

// Application icons for windows in Activities overview in Gnome-shell.
// Copyright (C) 2011 Miroslav Sustek

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

const Clutter = imports.gi.Clutter;
const Gdk = imports.gi.Gdk;
const GObject = imports.gi.GObject;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const Main = imports.ui.main;
const Tweener = imports.tweener.tweener;
const WindowPreview = imports.ui.windowPreview;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const { injectAfterFunction, removeInjection } = Me.imports.libs.monkeyPatching;
const { HorizontalAlignment, VerticalAlignment, PREFS_SCHEMA } = Me.imports.prefs;

const INITIAL_ICON_SIZE = 128;

let windowPreviewInjections = [];

let settings;

const RelativeIconSizeConstraint = GObject.registerClass(
class RelativeIconSizeConstraint extends Clutter.Constraint {
    _init(props) {
        this._source = props.source;
        this._ratio = props.ratio || 1;
        super._init();
    }

    vfunc_update_allocation(actor, actorBox) {
        let [sourceWidth, sourceHeight] = this._source.get_size();

        const size = Math.ceil(Math.min(sourceWidth, sourceHeight) * this._ratio);

        actorBox.set_size(size, size);
    }
});

const AbsoluteIconSizeConstraint = GObject.registerClass(
class AbsoluteIconSizeConstraint extends Clutter.Constraint {
    _init(props) {
        this._source = props.source;
        this._size = props.size;
        super._init();
    }

    vfunc_update_allocation(actor, actorBox) {
        const [sourceWidth, sourceHeight] = this._source.get_size();

        const minSize = Math.min(sourceWidth, sourceHeight, this._size);

        actorBox.set_size(minSize, minSize);
    }
});

function getHorizontalAlignmentFactorFromAlignmentSetting(horizontalAlignmentSetting) {
    switch (horizontalAlignmentSetting) {
    case HorizontalAlignment.LEFT:
        return 0;

    case HorizontalAlignment.MIDDLE:
        return 0.5;

    case HorizontalAlignment.RIGHT:
        return 1;
    }
}

function getVerticalAlignmentFactorFromAlignmentSetting(verticalAlignmentSetting) {
    switch (verticalAlignmentSetting) {
    case VerticalAlignment.TOP:
        return 0;

    case VerticalAlignment.MIDDLE:
        return 0.5;

    case VerticalAlignment.BOTTOM:
        return 1;
    }
}

function createApplicationIconForMetaWindow(metaWindow, size) {
    const tracker = Shell.WindowTracker.get_default();
    const windowApp = tracker.get_window_app(metaWindow);

    let icon;

    if (windowApp)
        icon = windowApp.create_icon_texture(size);

    if (!icon) {
        // fallback to default icon
        icon = new St.Icon({
            icon_name: 'application-x-executable',
            icon_size: size,
        });
    }

    return icon;
}

function enable() {
    windowPreviewInjections['_init'] = injectAfterFunction(WindowPreview.WindowPreview.prototype, '_init', function () {
        this._windowOverlayIconsExtension = {};
        const extension = this._windowOverlayIconsExtension;

        extension.box = new St.Bin({ style_class: 'windowoverlay-application-icon-box' });

        if (settings.get_boolean('icon-size-relative')) {
            extension.box.add_constraint(new RelativeIconSizeConstraint({
                source: this._windowContainer,
                ratio: settings.get_int('icon-size') / 100,
            }));
        } else {
            extension.box.add_constraint(new AbsoluteIconSizeConstraint({
                source: this._windowContainer,
                size: settings.get_int('icon-size'),
            }));
        }

        extension.box.add_constraint(new Clutter.BindConstraint({
            source: this._windowContainer,
            coordinate: Clutter.BindCoordinate.POSITION,
        }));
        extension.box.add_constraint(new Clutter.AlignConstraint({
            source: this._windowContainer,
            align_axis: Clutter.AlignAxis.X_AXIS,
            factor: getHorizontalAlignmentFactorFromAlignmentSetting(settings.get_enum('icon-horizontal-alignment')),
        }));
        extension.box.add_constraint(new Clutter.AlignConstraint({
            source: this._windowContainer,
            align_axis: Clutter.AlignAxis.Y_AXIS,
            factor: getVerticalAlignmentFactorFromAlignmentSetting(settings.get_enum('icon-vertical-alignment')),
        }));

        extension.box.connect('destroy', () => {
            Tweener.removeTweens(this._windowOverlayIconsExtension.box);
            this._windowOverlayIconsExtension.box = null;
        });

        extension.box.set_opacity(0);

        const [backgroundColorParseResult, backgroundColor] = Gdk.color_parse(settings.get_string('background-color'));
        if (backgroundColorParseResult) {
            extension.box.style = `background-color: rgba(
                ${backgroundColor.red / 65536 * 256}, 
                ${backgroundColor.green / 65536 * 256}, 
                ${backgroundColor.blue / 65536 * 256}, 
                ${settings.get_int('background-alpha') / 65536 * 256}
            );`;
        }

        Shell.util_set_hidden_from_pick(extension.box, true);

        this.add_child(extension.box);

        // Draw the icon below title and close button but above the border.
        // This makes cases when the icon is bigger than window overlay look better.
        this.set_child_above_sibling(this._title, extension.box);
        this.set_child_above_sibling(this._closeButton, extension.box);
        this.set_child_below_sibling(this._border, extension.box);

        extension.icon = createApplicationIconForMetaWindow(this.metaWindow, INITIAL_ICON_SIZE);
        extension.box.add_actor(extension.icon);

        Tweener.addTween(extension.box, {
            time: 0.1,
            opacity: settings.get_int('icon-opacity-blur'),
            transition: 'linear',
        });

        Main.overview.connect('hiding', () => {
            if (this._windowOverlayIconsExtension && this._windowOverlayIconsExtension.box) {
                Tweener.addTween(this._windowOverlayIconsExtension.box, {
                    time: 0.2,
                    opacity: 0,
                    transition: 'linear',
                });
            }
        });

        extension.box.connect('notify::size', () => {
            if (extension.icon) {
                const boxSize = Math.min(extension.box.size.width, extension.box.size.height);
                const boxMipmapLevel = Math.ceil(Math.log(boxSize) / Math.LN2);

                const iconSize = extension.icon.icon_size;
                const iconMipmapLevel = iconSize > 0 ? Math.ceil(Math.log(iconSize) / Math.LN2) : 0;

                if (boxMipmapLevel !== iconMipmapLevel) {
                    const newIconSize = Math.pow(2, Math.ceil(boxMipmapLevel));

                    const newIcon = createApplicationIconForMetaWindow(this.metaWindow, newIconSize);

                    extension.box.remove_actor(extension.icon);
                    extension.icon = newIcon;
                    extension.box.add_actor(extension.icon);
                }
            }
        });
    });

    windowPreviewInjections['showOverlay'] = injectAfterFunction(WindowPreview.WindowPreview.prototype, 'showOverlay', function (animate) {
        if (this._windowOverlayIconsExtension) {
            const extension = this._windowOverlayIconsExtension;

            if (extension.box) {
                if (animate) {
                    Tweener.addTween(extension.box, {
                        time: 0.2,
                        opacity: settings.get_int('icon-opacity-focus'),
                        transition: 'linear',
                    });
                }
            }
        }
    });

    windowPreviewInjections['hideOverlay'] = injectAfterFunction(WindowPreview.WindowPreview.prototype, 'hideOverlay', function (animate) {
        if (this._windowOverlayIconsExtension) {
            const extension = this._windowOverlayIconsExtension;

            if (extension.box) {
                if (animate) {
                    Tweener.addTween(extension.box, {
                        time: 0.2,
                        opacity: settings.get_int('icon-opacity-blur'),
                        transition: 'linear',
                    });
                }
            }
        }
    });

    windowPreviewInjections['_onDestroy'] = injectAfterFunction(WindowPreview.WindowPreview.prototype, '_onDestroy', () => {
        if (this._windowOverlayIconsExtension && this._windowOverlayIconsExtension.box)
            this._windowOverlayIconsExtension.box.destroy();
    });
}

function disable() {
    for (let i in windowPreviewInjections)
        removeInjection(WindowPreview.WindowPreview.prototype, windowPreviewInjections, i);
}

function init() {
    settings = Convenience.getSettings(PREFS_SCHEMA);
}

/* 3.0 API backward compatibility */
function main() {
    init();
    enable();
}
