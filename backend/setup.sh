#!/bin/bash
# Quick setup script for primary battle automation
# This runs the setup-agent-wallets.js script

cd "$(dirname "$0")"
node scripts/setup-agent-wallets.js
