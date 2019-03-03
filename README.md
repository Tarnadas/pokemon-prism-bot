# Pokemon Prism Discord Bot

## Quick Start

### Installation

```
$ git clone https://github.com/Tarnadas/pokemon-prism-bot.git
$ cd pokemon-prism-bot
$ npm i
```

Add a `secret.js` to src folder with `export const botToken = "yourBotToken"` as content.

Add `7z.exe` to your Bot's root folder (the one containing `package.json`)

### Start Bot
```
$ npm start
```

### Run using docker-compose

```
# -- Prism Patcher Bot
prism:
    image: 'prism:latest'
    build: '/path/to/Dockerfile'
    restart: 'on-failure:5' # Restarts the bot if it fails to load 5 times
    expose:
        - '80'
        - '443'
```

## Credits

7zip company

ax6

Tarnadas

Retrosol
