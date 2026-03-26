#!/bin/bash
echo "UTP+ Calendar Bot -- Setup"
echo "=============================="

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found. Install it from: https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "ERROR: Node.js 20+ required. Current version: $(node -v)"
    exit 1
fi

echo "Node.js $(node -v) detected"

# Install dependencies
echo "Installing dependencies..."
npm install

# Install Playwright browsers
echo "Installing Chromium for Playwright..."
npx playwright install chromium

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    cp .env.example .env
    echo ".env file created. EDIT IT with your credentials before continuing."
    echo "   nano .env"
else
    echo ".env already exists"
fi

# Create data directory
mkdir -p data
mkdir -p data/screenshots

# Show next steps
echo ""
echo "To create your Telegram bot:"
echo "   1. Open @BotFather on Telegram"
echo "   2. Send /newbot and follow instructions"
echo "   3. Copy the token to .env (TELEGRAM_BOT_TOKEN)"
echo "   4. Send a message to your bot"
echo "   5. Visit https://api.telegram.org/bot<TOKEN>/getUpdates"
echo "   6. Copy your chat_id to .env (TELEGRAM_CHAT_ID)"
echo ""
echo "Setup complete. Edit .env and run: npm run dev"
