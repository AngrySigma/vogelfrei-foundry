#!/bin/bash

if [ ! -d "/home/node/.foundryvtt" ]; then
    # Check if there is a .foundrycache folder in the workspace and it has at least one file
    if [ -d "/workspaces/vogelfrei/.foundrycache" ] && [ "$(ls -A /workspaces/vogelfrei/.foundrycache)" ]; then
        # Find the newest file in the .foundrycache directory
        cachedFoundryFile=$(ls -t /workspaces/vogelfrei/.foundrycache/*.zip | head -1)
        echo "Using cached FoundryVTT file $cachedFoundryFile"
        cp "/workspaces/vogelfrei/.foundrycache/$(basename "$cachedFoundryFile")" .
        foundryFile=$(basename "$cachedFoundryFile")
    else
        echo 'Please provide the FoundryVTT timed URL from https://foundryvtt.com/. Select the Linux/Node.js operating system.'
        read -p 'FoundryVTT URL: ' foundryUrl
        # Get the filename from the URL
        foundryFile=$(basename "$foundryUrl" | cut -d'?' -f1)
        echo "Downloading $foundryFile"
        curl -L "$foundryUrl" -o "$foundryFile"
        echo "Copying $foundryFile to .foundrycache"
        mkdir -p /workspaces/vogelfrei/.foundrycache
        cp "$foundryFile" /workspaces/vogelfrei/.foundrycache
    fi
    # quietly unzip the file
    echo "Unzipping $foundryFile"
    unzip "$foundryFile" -d /home/node/.foundryvtt > /dev/null
    rm "$foundryFile"
    mkdir -p /home/node/.foundrydata/Data/systems
fi

ln -s /workspaces/vogelfrei /home/node/.foundrydata/Data/systems/vogelfrei-dev
