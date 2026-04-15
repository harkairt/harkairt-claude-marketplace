#!/bin/bash
error_output=$(jq . 2>&1)
if [ $? -ne 0 ]; then
    echo "Error: Invalid JSON input: $error_output" >&2
    exit 1
fi

echo "$error_output"
exit 0


