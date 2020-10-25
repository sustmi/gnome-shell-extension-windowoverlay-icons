default_target: all

po_files := $(wildcard ./po/*.po)

.PHONY: all clean schemas zip

all: update_dependencies schemas locales

clean:
	rm -f windowoverlay-icons.zip
	rm -f ./schemas/gschemas.compiled

update_dependencies:
	git submodule update --init

check: update_dependencies
	npm run check

schemas:
	glib-compile-schemas ./schemas

locales: $(po_files)
	for FILE in $(po_files); do \
		LOCALE=`basename $$FILE .po`; \
		mkdir -p ./locale/$$LOCALE/LC_MESSAGES; \
		msgfmt -o ./locale/$$LOCALE/LC_MESSAGES/windowoverlay-icons.mo ./po/$$LOCALE.po; \
	done

zip: all
	zip -rq windowoverlay-icons.zip \
		COPYING \
		README.md \
		*.js \
		libs/*.js \
		metadata.json \
		prefs.xml \
		stylesheet.css \
		locale/* \
		schemas/*
