#!/bin/bash
# PDF Processing Skill - Setup Script
# Ensures all dependencies are installed for the pdf-processing skill

set -e

echo "=========================================="
echo "PDF Processing Skill - Setup Script"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Detect OS
DETECTED_OS=""
if [[ "$OSTYPE" == "darwin"* ]]; then
    DETECTED_OS="macos"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Check if Ubuntu/Debian
    if command -v apt-get &> /dev/null; then
        DETECTED_OS="ubuntu"
    elif command -v dnf &> /dev/null; then
        DETECTED_OS="fedora"
    elif command -v yum &> /dev/null; then
        DETECTED_OS="rhel"
    else
        DETECTED_OS="linux"
    fi
else
    DETECTED_OS="unknown"
fi

echo -e "${YELLOW}Detected OS: $DETECTED_OS${NC}"
echo ""

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
echo "Installing Node.js Dependencies..."
echo "=========================================="

# Install required Node.js packages
REQUIRED_PACKAGES="pdf-parse pdfkit pdf-lib"
echo "Packages to install: $REQUIRED_PACKAGES"
echo ""

# Check if we're in a node project or need global install
if [ -f "package.json" ]; then
    echo "Found package.json - installing locally..."
    npm install $REQUIRED_PACKAGES
else
    echo "No package.json found - installing globally..."
    npm install -g $REQUIRED_PACKAGES
fi

echo -e "${GREEN}✓ Node.js dependencies installed${NC}"

echo ""
echo "=========================================="
echo "Checking Poppler (for visual validation)..."
echo "=========================================="

# Check if Poppler is installed
if command -v pdftoppm &> /dev/null; then
    echo -e "${GREEN}✓ Poppler (pdftoppm) is already installed${NC}"
    pdftoppm -v 2>&1 | head -1
else
    echo -e "${YELLOW}⚠ Poppler is not installed${NC}"
    echo "  Visual PDF validation will not be available."
    echo ""
    echo "To install Poppler:"
    
    case $DETECTED_OS in
        macos)
            echo "  $ brew install poppler"
            ;;
        ubuntu)
            echo "  $ sudo apt-get update"
            echo "  $ sudo apt-get install -y poppler-utils"
            ;;
        fedora|rhel)
            echo "  $ sudo dnf install poppler-utils"
            ;;
        *)
            echo "  - macOS: brew install poppler"
            echo "  - Ubuntu/Debian: sudo apt-get install poppler-utils"
            echo "  - Fedora/RHEL: sudo dnf install poppler-utils"
            ;;
    esac
    
    echo ""
    read -p "Would you like to install Poppler now? (y/n) " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        case $DETECTED_OS in
            macos)
                if command -v brew &> /dev/null; then
                    brew install poppler
                else
                    echo -e "${RED}✗ Homebrew not found. Please install Homebrew first:${NC}"
                    echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
                fi
                ;;
            ubuntu)
                sudo apt-get update
                sudo apt-get install -y poppler-utils
                ;;
            fedora|rhel)
                sudo dnf install poppler-utils
                ;;
            *)
                echo -e "${RED}✗ Automatic installation not supported for this OS.${NC}"
                echo "Please install Poppler manually using the instructions above."
                ;;
        esac
    else
        echo "Skipping Poppler installation."
        echo "Core PDF functionality will work without it."
    fi
fi

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Summary:"

# Final check
echo "Checking final installation status..."
echo ""

NODE_PACKAGES_OK=true
for pkg in pdf-parse pdfkit pdf-lib; do
    if npm list $pkg &> /dev/null || npm list -g $pkg &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} $pkg"
    else
        echo -e "  ${YELLOW}⚠${NC} $pkg (may not be properly installed)"
        NODE_PACKAGES_OK=false
    fi
done

if command -v pdftoppm &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} Poppler (pdftoppm) - visual validation available"
else
    echo -e "  ${YELLOW}⚠${NC} Poppler not installed - visual validation unavailable"
fi

echo ""
echo -e "${GREEN}The pdf-processing skill is ready to use!${NC}"
echo ""
echo "Features available:"
echo "  - Read/extract text from PDFs (pdf-parse)"
echo "  - Generate new PDFs (pdfkit)"
echo "  - Edit/merge PDFs (pdf-lib)"
if command -v pdftoppm &> /dev/null; then
    echo "  - Visual validation via PNG rendering (pdftoppm)"
else
    echo "  - (Install Poppler to enable visual validation)"
fi
