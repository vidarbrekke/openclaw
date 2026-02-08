#!/bin/bash
# Spreadsheet Processing Skill - Setup Script
# Ensures all dependencies are installed for the spreadsheet-processing skill

set -e

echo "=========================================="
echo "Spreadsheet Processing Skill - Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Node.js is installed
echo "Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓ Node.js is installed ($NODE_VERSION)${NC}"
else
    echo -e "${RED}✗ Node.js is not installed${NC}"
    echo "  Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
echo "Checking npm..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓ npm is installed ($NPM_VERSION)${NC}"
else
    echo -e "${RED}✗ npm is not installed${NC}"
    echo "  Please install Node.js (includes npm) from https://nodejs.org/"
    exit 1
fi

echo ""
echo "=========================================="
echo "Installing exceljs..."
echo "=========================================="
echo ""

# Check if we're in a node project or need global install
if [ -f "package.json" ]; then
    echo "Found package.json - installing locally..."
    npm install exceljs
else
    echo "No package.json found - installing globally..."
    npm install -g exceljs
fi

echo ""
echo -e "${GREEN}✓ Setup complete!${NC}"
echo ""
echo "The spreadsheet-processing skill is ready to use."
echo "Features available:"
echo "  - Create Excel workbooks with formulas and formatting"
echo "  - Read and modify existing .xlsx files"
echo "  - Convert CSV ↔ XLSX"
echo "  - Data analysis and aggregation"
