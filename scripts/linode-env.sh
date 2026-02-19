#!/bin/bash
# linode-env.sh - Load Linode credentials from ~/.linode.env

if [[ -f ~/.linode.env ]]; then
    # shellcheck source=/dev/null
    source ~/.linode.env
else
    echo "Error: ~/.linode.env not found. Please create it with your Linode credentials."
    exit 1
fi
