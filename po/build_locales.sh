#!/bin/sh

FILES=*.po

echo -n "Building locales:"
for FILE in $FILES; do
	FILE=`echo $FILE | sed 's/\(.*\)\.po/\1/'`
	mkdir -p ../locale/$FILE/LC_MESSAGES
	echo -n " $FILE"
	msgfmt -o ../locale/$FILE/LC_MESSAGES/windowoverlay-icons.mo $FILE.po
done
echo "";

