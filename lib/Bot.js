'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _discord = require('discord.js');

var _discord2 = _interopRequireDefault(_discord);

var _got = require('got');

var _got2 = _interopRequireDefault(_got);

var _node7z = require('node-7z');

var _node7z2 = _interopRequireDefault(_node7z);

var _md = require('md5');

var _md2 = _interopRequireDefault(_md);

var _rimraf = require('rimraf');

var _rimraf2 = _interopRequireDefault(_rimraf);

var _concatStream = require('concat-stream');

var _concatStream2 = _interopRequireDefault(_concatStream);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _secret = require('./secret');

var _bsppatch = require('./bsppatch');

var _bsppatch2 = _interopRequireDefault(_bsppatch);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// used to decompress rar file
const zipLib = new _node7z2.default();

// this is the bsppatch.js file, slightly changed to support Node and minified with Google Closure Compiler


// got is an easy to use library to make HTTP requests. We use it to download files

const unzip = zipLib.extractFull;

const UPDATE_BSP_DELAY = 60000;

class Bot {
  constructor(channelId) {
    // let's just bind everything to prevent errors
    this.onMessage = this.onMessage.bind(this);
    this.initializeBsp = this.initializeBsp.bind(this);
    this.updateBsp = this.updateBsp.bind(this);
    this.clearUser = this.clearUser.bind(this);

    this.client = new _discord2.default.Client();
    this.file = {};
    this.option = {};
    this.waitForOption = {};
    this.optionSize = {};
    this.isSave = {};
    this.messagesSent = {};

    this.client.on("ready", () => {
      console.log("I am ready!");
      this.channel = this.client.channels.get(channelId);
      this.initializeBsp();
      this.updateBsp();
      setInterval(this.updateBsp, UPDATE_BSP_DELAY);
    });

    this.client.on("message", this.onMessage);

    this.client.login(_secret.botToken);
  }

  async onMessage(message) {
    // if message comes from bot itself, return
    if (message.author.bot) return;

    // if message is not a direct message, return
    if (message.channel.type !== 'dm') return;

    const clientId = message.author.id;
    if (this.waitForOption[clientId]) {
      try {
        this.option[clientId] = parseInt(message.content) - 1;
        if (isNaN(this.option[clientId])) throw '';
        if (this.option[clientId] < 0 || this.option[clientId] >= this.optionSize[clientId]) {
          message.author.send('Your number is out of bounds.');
          return;
        }
        this.waitForOption[clientId] = false;
      } catch (err) {
        message.author.send('Error: Dude, this is not a number.');
        return;
      }
    }

    // loop over sent attachments
    const attachments = message.attachments.array();
    for (let i in attachments) {
      message.author.send('Downloading your file. Please be patient.');
      const attachment = attachments[i];

      // download attachment to bot
      const fileBuf = await downloadFile(attachment.url);
      this.file[clientId] = new Uint8Array(fileBuf).buffer;
      console.log(`New file uploaded by user ${message.author.username} with MD5: ${(0, _md2.default)(fileBuf)}`);
    }

    if (!this.file[clientId]) {
      message.author.send(`Hey ${message.author.username}\nI am a Bot created by Tarnadas, Retrosol and ax6 who can update your Crystal ROM to the latest Pokémon Prism release.\nJust send me your dumped ROM and I will do the rest for you.`);
      return;
    }
    if (!this.bsp || !(this.bsp instanceof ArrayBuffer)) {
      message.author.send('I couldn\'t find a valid patch file. Please try again later.');
      return;
    }

    // PATCH IT BABY
    try {
      const { code, options, data, messages } = await (0, _bsppatch2.default)(this.bsp, this.file[clientId], this.option[clientId]);

      let resultMessage = '';
      for (let i = this.messagesSent[clientId] ? this.messagesSent[clientId] : 0; i < messages.length; i++) {
        resultMessage += `${messages[i]}\n`;
      }
      if (code === _bsppatch.BSP_RESULT.MENU && messages) {
        for (let i = 0; i < options.length; i++) {
          resultMessage += `(${i + 1}) ${options[i]} `;
        }
        resultMessage += '\n(please just send the respective number)';
        if (resultMessage.includes('savefile')) this.isSave[clientId] = true;
        this.optionSize[clientId] = options.length;
        this.messagesSent[clientId] = messages.length;
        this.waitForOption[clientId] = true;
        message.author.send(resultMessage);
      } else if (code === _bsppatch.BSP_RESULT.SUCCESS) {
        this.messagesSent[clientId] = messages.length;
        message.author.send(resultMessage);
        message.author.send('Uploading your patched file. Please be patient.');
        message.author.send('Here is your patched file', { files: [{
            attachment: Buffer.from(data),
            name: `PokemonPrism.${this.isSave[clientId] ? 'sav' : 'gbc'}`
          }] });
        this.clearUser(clientId);
      } else if (code === _bsppatch.BSP_RESULT.ERROR) {
        message.author.send(`Error: ${result}`);
        this.clearUser(clientId);
      }

      // send back to user
    } catch (err) {
      // file was not able to be patched
      console.error(err);
      message.author.send(`An internal error occurred: ${err}\nPlease report this error to the author of the Bot.`);
      this.clearUser(clientId);
    }
  }

  initializeBsp() {
    const bspPath = _path2.default.resolve(__dirname, '../tmp/bsp/pokeprism.bsp');
    if (_fs2.default.existsSync(bspPath)) {
      const bspBuf = _fs2.default.readFileSync(bspPath);
      this.bsp = new Uint8Array(bspBuf).buffer;
      console.log(`Loaded patch .bsp file with MD5: ${(0, _md2.default)(bspBuf)}`);
    }
  }

  async updateBsp(before) {
    try {
      // loop through last messages and find first occurrence of .rar file
      const [url, messageId] = await new Promise(async (resolve, reject) => {
        try {
          const findRar = async (resolve, before) => {
            const messages = (await this.channel.fetchMessages(before ? { before } : undefined)).array();
            if (messages == null) return;
            for (let i in messages) {
              const message = messages[i];
              if (!message.attachments) return;
              const attachments = message.attachments.array();
              for (let j in attachments) {
                const attachment = attachments[j];
                if (!/^.*\.rar$/.test(attachment.filename)) continue;
                resolve([attachment.url, message.id]);
                return;
              }
            }
            await findRar(resolve, messages[messages.length - 1].id);
          };
          await findRar(resolve, before);
          reject('No .bsp patch file found in channel');
        } catch (err) {
          reject(err);
        }
      });

      // only update bsp on new patch file
      if (url === this.lastUrl) return;
      this.lastUrl = url;

      try {
        // download .rar file
        const tmpDir = _path2.default.resolve(__dirname, '../tmp');
        const rar = _path2.default.resolve(tmpDir, 'rar');
        await downloadFile(url, rar);

        // decompress .rar file
        const bsp = _path2.default.resolve(tmpDir, 'bsp');
        if (_fs2.default.existsSync(bsp)) {
          await new Promise((resolve, reject) => {
            (0, _rimraf2.default)(bsp, err => {
              if (err) reject(err);
              resolve();
            });
          });
        }
        await unzip(rar, bsp);

        // read new patch .bsp file
        const bspPath = _path2.default.resolve(bsp, 'pokeprism.bsp');
        if (!_fs2.default.existsSync(bspPath)) throw '';
        const bspBuf = _fs2.default.readFileSync(bspPath);
        this.bsp = bspBuf.buffer;
        console.log(`Received new patch .bsp file with MD5: ${(0, _md2.default)(bspBuf)}`);
      } catch (err) {
        await this.updateBsp(messageId);
      }
    } catch (err) {
      console.error(err);
    }
  }

  clearUser(clientId) {
    delete this.file[clientId];
    delete this.option[clientId];
    delete this.waitForOption[clientId];
    delete this.optionSize[clientId];
    delete this.isSave[clientId];
    delete this.messagesSent[clientId];
  }
}

exports.default = Bot;
const downloadFile = async (downloadUrl, streamPath) => {
  return await new Promise(async (resolve, reject) => {
    // download file
    const tmpDir = _path2.default.resolve(__dirname, '../tmp');
    if (!_fs2.default.existsSync(tmpDir)) {
      _fs2.default.mkdirSync(tmpDir);
    }
    const stream = _got2.default.stream(downloadUrl);
    stream.on('error', err => {
      reject(err);
    });
    if (streamPath) {
      resolve((await writeToFile(stream, streamPath)));
    } else {
      resolve((await new Promise(resolve => {
        stream.pipe((0, _concatStream2.default)(buf => {
          resolve(buf);
        }));
      })));
    }
  });
};

const writeToFile = async (stream, streamPath) => {
  return await new Promise(async (resolve, reject) => {
    const fileStream = _fs2.default.createWriteStream(streamPath);
    fileStream.on('close', async () => {
      resolve();
    });
    fileStream.on('error', err => {
      reject(err);
    });
    stream.pipe(fileStream);
  });
};