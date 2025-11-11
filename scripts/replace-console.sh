#!/bin/bash

# Script to replace console calls with logger calls in database/connection.ts
file="src/database/connection.ts"

# Replace remaining console calls
sed -i '' 's/console\.debug(/this.logger.debug(/g' "$file"
sed -i '' 's/console\.warn(/this.logger.warn(/g' "$file"
sed -i '' 's/console\.error(/this.logger.error(/g' "$file"
sed -i '' 's/console\.log(/this.logger.info(/g' "$file"

echo "Console calls replaced in $file"