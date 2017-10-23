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

const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Gdk = imports.gi.Gdk;

const Tweener = imports.tweener.tweener;
const Workspace = imports.ui.workspace;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const PREFS_SCHEMA = 'org.gnome.shell.extensions.windowoverlay-icons';

const HorizontalAlignment = {
    LEFT: 1,
    MIDDLE: 2,
    RIGHT: 3
};

const VerticalAlignment = {
    TOP: 1,
    MIDDLE: 2,
    BOTTOM: 3
};

let wsWinOverInjections;
let createdActors;
let settings;

function resetState() {
    wsWinOverInjections = { };
    createdActors = [ ];
}

function enable() {
    resetState();
    
    wsWinOverInjections['_init'] = undefined;
    wsWinOverInjections['hide'] = undefined;
    wsWinOverInjections['show'] = undefined;
    wsWinOverInjections['_onEnter'] = undefined;
    wsWinOverInjections['_onLeave'] = undefined;
    wsWinOverInjections['updatePositions'] = undefined;
    wsWinOverInjections['relayout'] = undefined;
    wsWinOverInjections['_onDestroy'] = undefined;
    
    wsWinOverInjections['_init'] = injectToFunction(Workspace.WindowOverlay.prototype, '_init', function(windowClone, parentActor) {
        this._windowOverlayIconsExtension = {};
        
        this._windowOverlayIconsExtension.box = new St.Bin({ style_class: 'windowoverlay-application-icon-box' });
        this._windowOverlayIconsExtension.box.set_opacity(settings.get_int('icon-opacity-blur'));
        
        [result, background_color] = Gdk.color_parse(settings.get_string('background-color'));
        if (result) {
            this._windowOverlayIconsExtension.box.style = 'background-color: rgba(' +
                                                            (background_color.red / 65536 * 256) + ', ' +
                                                            (background_color.green / 65536 * 256) + ', ' +
                                                            (background_color.blue / 65536 * 256) +', ' +
                                                            (settings.get_int('background-alpha') / 65536 * 256) + ')';
        }
        
        Shell.util_set_hidden_from_pick(this._windowOverlayIconsExtension.box, true);
        
        createdActors.push(this._windowOverlayIconsExtension.box);
        parentActor.add_actor(this._windowOverlayIconsExtension.box);

        // Draw the icon below title and close button but above the border.
        // This makes cases when the icon is bigger than window overlay look better.
        parentActor.set_child_above_sibling(this.title, this._windowOverlayIconsExtension.box);
        parentActor.set_child_above_sibling(this.closeButton, this._windowOverlayIconsExtension.box);
        parentActor.set_child_below_sibling(this.border, this._windowOverlayIconsExtension.box);
    });
    
    wsWinOverInjections['hide'] = injectToFunction(Workspace.WindowOverlay.prototype, 'hide', function() {
        this._windowOverlayIconsExtension.box.hide();
    });
    
    wsWinOverInjections['show'] = injectToFunction(Workspace.WindowOverlay.prototype, 'show', function() {
        this._windowOverlayIconsExtension.box.show();
    });
    
    wsWinOverInjections['_onEnter'] = injectToFunction(Workspace.WindowOverlay.prototype, '_onEnter', function() {
        Tweener.addTween(this._windowOverlayIconsExtension.box, { time: 0.2,
                                                                  opacity: settings.get_int('icon-opacity-focus'),
                                                                  transition: 'linear' });
        
    });
    wsWinOverInjections['_onLeave'] = injectToFunction(Workspace.WindowOverlay.prototype, '_onLeave', function() {
        Tweener.addTween(this._windowOverlayIconsExtension.box, { time: 0.2,
                                                                  opacity: settings.get_int('icon-opacity-blur'),
                                                                  transition: 'linear' });
    });
    
    let updatePositions = function(cloneX, cloneY, cloneWidth, cloneHeight, animate) {
        let icon_size = settings.get_int('icon-size');
        let icon_size_relative = settings.get_boolean('icon-size-relative');
        
        let clone_size = Math.min(cloneWidth, cloneHeight);
        
        if (icon_size_relative) {
            icon_size = Math.floor(clone_size * icon_size / 100);
        }
        
        this._windowOverlayIconsExtension.box.width = icon_size;
        this._windowOverlayIconsExtension.box.height = icon_size;
        
        // Mipmapping (using square icon textures; size power of two)
        let icon_mipmap_level = Math.log(icon_size) / Math.LN2;
        // Always minify (use texture bigger than target box)
        let icon_mipmap_size = Math.pow(2, Math.ceil(icon_mipmap_level));
        
        // WORKAROUND for bug: https://extensions.gnome.org/errors/view/1334
        // > If, in overview, one moves a window to another desktop and then
        // > pulls it back onto the active workspace (without leaving overview),
        // > a blank icon is displayed.
        // IDK why, but in this situation tracker.get_window_app() returns null.
        let refreshIcon = false;
        if (!this._windowOverlayIconsExtension.app) {
            let tracker = Shell.WindowTracker.get_default();
            this._windowOverlayIconsExtension.app = tracker.get_window_app(this._windowClone.metaWindow);
            if (this._windowOverlayIconsExtension.app) {
                refreshIcon = true;
            }
        }
        
        // request new icon size
        if (this._windowOverlayIconsExtension.mipmap_size != icon_mipmap_size || refreshIcon) {
            if (this._windowOverlayIconsExtension.icon) {
                this._windowOverlayIconsExtension.box.remove_actor(this._windowOverlayIconsExtension.icon);
            }
            
            if (this._windowOverlayIconsExtension.app) {
                this._windowOverlayIconsExtension.icon = this._windowOverlayIconsExtension.app.create_icon_texture(icon_mipmap_size);
            }
            if (!this._windowOverlayIconsExtension.icon) {
                // fallback to default icon
                let texture_cache = St.TextureCache.get_default();
                this._windowOverlayIconsExtension.icon = new St.Icon({ icon_name: 'application-x-executable',
                                                                    	 icon_size: icon_mipmap_size });
            }
            
            this._windowOverlayIconsExtension.box.add_actor(this._windowOverlayIconsExtension.icon);
            
            this._windowOverlayIconsExtension.mipmap_size = icon_mipmap_size;
        }
        
        this._windowOverlayIconsExtension.icon.width = icon_size - 8;
        this._windowOverlayIconsExtension.icon.height = icon_size - 8;
        
        let iconX, iconY;
        
        switch (settings.get_enum('icon-horizontal-alignment')) {
            case HorizontalAlignment.LEFT:
                iconX = cloneX + 3;
                break;
                
            case HorizontalAlignment.MIDDLE:
                iconX = cloneX + (cloneWidth - this._windowOverlayIconsExtension.box.width) / 2;
                break;
                
            case HorizontalAlignment.RIGHT:
                iconX = cloneX + cloneWidth - this._windowOverlayIconsExtension.box.width - 3;
                break
        }
        
        switch (settings.get_enum('icon-vertical-alignment')) {
            case VerticalAlignment.TOP:
                iconY = cloneY + 3;
                break;
                
            case VerticalAlignment.MIDDLE:
                iconY = cloneY + (cloneHeight - this._windowOverlayIconsExtension.box.height) / 2;
                break;
                
            case VerticalAlignment.BOTTOM:
                iconY = cloneY + cloneHeight - this._windowOverlayIconsExtension.box.height - 3;
                break
        }
        
        if (animate) {
            this._animateOverlayActor(this._windowOverlayIconsExtension.box, Math.floor(iconX), Math.floor(iconY), this._windowOverlayIconsExtension.box.width);
        } else {
            this._windowOverlayIconsExtension.box.set_position(Math.floor(iconX), Math.floor(iconY));
        }
    };
    
    wsWinOverInjections['relayout'] = injectToFunction(Workspace.WindowOverlay.prototype, 'relayout', function(animate) {
        let [cloneX, cloneY, cloneWidth, cloneHeight] = this._windowClone.slot;
        updatePositions.call(this, cloneX, cloneY, cloneWidth, cloneHeight, animate);
    });

    wsWinOverInjections['_onDestroy'] = injectToFunction(Workspace.WindowOverlay.prototype, '_onDestroy', function() {
        this._windowOverlayIconsExtension.box.destroy();
    });

}

function injectToFunction(objectPrototype, functionName, injectedFunction) {
    let originalFunction = objectPrototype[functionName];

    objectPrototype[functionName] = function() {
        let returnValue;

        if (originalFunction !== undefined) {
        	returnValue = originalFunction.apply(this, arguments);
        }

        let injectedReturnValue = injectedFunction.apply(this, arguments);
        if (returnValue === undefined) {
            returnValue = injectedReturnValue;
        }

        return returnValue;
    }

    return originalFunction;
}

function removeInjection(objectPrototype, injection, functionName) {
    if (injection[functionName] === undefined) {
        delete objectPrototype[functionName];
    } else {
        objectPrototype[functionName] = injection[functionName];
    }
}

function disable() {
    for (let i in wsWinOverInjections) {
        removeInjection(Workspace.WindowOverlay.prototype, wsWinOverInjections, i);
    }
    for each (let i in createdActors) {
        i.destroy();
    }
    resetState();
}

function init() {
    settings = Convenience.getSettings(PREFS_SCHEMA);
}

/* 3.0 API backward compatibility */
function main() {
    init();
    enable();
} 
