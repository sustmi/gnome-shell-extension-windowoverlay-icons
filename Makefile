default_target: all

po_files := $(wildcard ./po/*.po)

.PHONY: all clean schemas zip

all: schemas locales

clean:
	rm -f windowoverlay-icons.zip
	rm -f ./schemas/gschemas.compiled

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
		metadata.json \
		prefs.xml \
		stylesheet.css \
		locale/* \
		schemas/*
