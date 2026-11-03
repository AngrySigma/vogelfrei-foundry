for keyval in $(grep -E '": [^\{]' ../foundryconfig.json | sed -e 's/: /=/' -e "s/\(\,\)$//"); do
    eval export $keyval
done
sed "s/\"name\": \"vogelfrei\",/\"name\": \"$symlinkName\",/g" $@
sed "s/\"id\": \"vogelfrei\",/\"id\": \"$symlinkName\",/g" $@
