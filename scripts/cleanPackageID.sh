for keyval in $(grep -E '": [^\{]' ../foundryconfig.json | sed -e 's/: /=/' -e "s/\(\,\)$//"); do
    eval export $keyval
done
sed "s/\"name\": \"$symlinkName\",/\"name\": \"vogelfrei\",/g" $@
sed 's/\"id\": \"$symlinkName\",/\"id\": \"vogelfrei\",/g' $@
