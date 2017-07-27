import Discord from 'discord.js'

// got is an easy to use library to make HTTP requests. We use it to download files
import got from 'got'

// used to decompress rar file
import Zip from 'node-7z'

import md5 from 'md5'

import rimraf from 'rimraf'

import concat from 'concat-stream'

import fs from 'fs'
import path from 'path'

import { botToken } from './secret'

// this is the bsppatch.js file, slightly changed to support Node and minified with Google Closure Compiler
import bspPatch, { BSP_RESULT } from './bsppatch'

const zipLib = new Zip()
const unzip = zipLib.extractFull

export default class Bot {
  constructor (channelId) {
    // let's just bind everything to prevent errors
    this.onMessage = this.onMessage.bind(this)
    this.initializeBsp = this.initializeBsp.bind(this)
    this.updateBsp = this.updateBsp.bind(this)

    this.client = new Discord.Client()
    this.file = {}
    this.option = {}
    this.waitForOption = {}

    this.client.on("ready", () => {
      console.log("I am ready!")
      this.channel = this.client.channels.get(channelId)
      this.initializeBsp()
      this.updateBsp()
    })

    this.client.on("message", this.onMessage)

    this.client.login(botToken)
  }

  async onMessage (message) {
    // if message comes from bot itself, return
    if (message.author.bot) return

    // if message is not a direct message, return
    if (message.channel.type !== 'dm') return

    const clientId = message.author.id
    if (this.waitForOption[clientId]) {
      try {
        this.option[clientId] = parseInt(message.content) - 1
        if (isNaN(this.option[clientId])) throw ''
        if (this.option[clientId] < 0 || this.option[clientId] > 1) {
          message.author.send('Your number is out of bounds.')
          return
        }
        this.waitForOption[clientId] = false
      } catch (err) {
        message.author.send('Error: Dude, this is not a number.')
        return
      }
    }

    await this.updateBsp()

    // loop over sent attachments
    const attachments = message.attachments.array()
    for (let i in attachments) {
      message.author.send('Downloading your file. Please be patient.')
      const attachment = attachments[i]

      // download attachment to bot
      const fileBuf = await downloadFile(attachment.url)
      this.file[clientId] = new Uint8Array(fileBuf).buffer
      console.log(`New file uploaded by user ${message.author.username} with MD5: ${md5(fileBuf)}`)
    }

    if (!this.file[clientId]) {
      message.author.send(`Hey ${message.author.username}\nI am a Bot, who can update your Crystal ROM to the latest Pokémon Prism release.\nJust send me your dumped ROM and I will do the rest for you.`)
      return
    }
    if (!this.bsp || !(this.bsp instanceof ArrayBuffer)) {
      message.author.send('I couldn\'t find a valid patch file. Please try again later.')
      return
    }

    // PATCH IT BABY
    try {
      const [ code, result, messages ] = await bspPatch(this.bsp, this.file[clientId], this.option[clientId])

      if (code === BSP_RESULT.MENU && messages) {
        let resultMessage = ''
        for (let i in messages) {
          resultMessage += messages[i] + '\n'
        }
        resultMessage += `(1) ${result[0]} | (2) ${result[1]}\n(please just send the respective number)`
        message.author.send(resultMessage)
        this.waitForOption[clientId] = true
      } else if (code === BSP_RESULT.SUCCESS) {
        message.author.send('Uploading your patched file. Please be patient.')
        message.author.send('Here is your patched file', { files: [
          {
            attachment: Buffer.from(result),
            name: `PokemonPrism.gbc`
          }
        ]})
        delete this.file[clientId]
        delete this.option[clientId]
        delete this.waitForOption[clientId]
      } else if (code === BSP_RESULT.ERROR) {
        message.author.send(`Error: ${result}`)
        delete this.file[clientId]
        delete this.option[clientId]
        delete this.waitForOption[clientId]
      }

      // send back to user
    } catch (err) {
      // file was not able to be patched
      console.error(err)
      message.author.send(`An internal error occurred: ${err}\nPlease report this error to the author of the Bot.`)
    }
  }

  initializeBsp () {
    const bspPath = path.resolve(__dirname, '../tmp/bsp/pokeprism.bsp')
    if (fs.existsSync(bspPath)) {
      const bspBuf = fs.readFileSync(bspPath)
      this.bsp = new Uint8Array(bspBuf).buffer
      console.log(`Loaded patch .bsp file with MD5: ${md5(bspBuf)}`)
    }
  }

  async updateBsp () {
    if (this.doUpdate) return
    this.doUpdate = true
    try {
      // loop through last messages and find first occurrence of .rar file
      const url = await new Promise(async (resolve, reject) => {
        try {
          const messages = (await this.channel.fetchMessages()).array()
          if (messages == null) return
          for (let i in messages) {
            const message = messages[i]
            if (!message.attachments) return
            const attachments = message.attachments.array()
            for (let j in attachments) {
              const attachment = attachments[j]
              if (!/^.*\.rar$/.test(attachment.filename)) return
              resolve(attachment.url)
            }
          }
          reject('No .bsp patch file found in channel')
        } catch (err) {
          reject(err)
        }
      })

      // only update bsp on new patch file
      if (url === this.lastUrl) return
      this.lastUrl = url

      // download .rar file
      const tmpDir = path.resolve(__dirname, '../tmp')
      const rar = path.resolve(tmpDir, 'rar')
      await downloadFile(url, rar)

      // decompress .rar file
      const bsp = path.resolve(tmpDir, 'bsp')
      if (fs.existsSync(bsp)) {
        await new Promise((resolve, reject) => {
          rimraf(bsp, err => {
            if (err) reject(err)
            resolve()
          })
        })
      }
      await unzip(rar, bsp)

      // read new patch .bsp file
      const bspBuf = fs.readFileSync(path.resolve(bsp, 'pokeprism.bsp'))
      this.bsp = bspBuf.buffer
      console.log(`Received new patch .bsp file with MD5: ${md5(bspBuf)}`)
    } catch (err) {
      console.error(err)
    } finally {
      this.doUpdate = false
    }
  }
}

const downloadFile = async (downloadUrl, streamPath) => {
  return await new Promise(async (resolve, reject) => {
    // download file
    const tmpDir = path.resolve(__dirname, '../tmp')
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir)
    }
    const stream = got.stream(downloadUrl)
    stream.on('error', err => {
      reject(err)
    })
    if (streamPath) {
      resolve(await writeToFile(stream, streamPath))
    } else {
      resolve(await new Promise(resolve => {
        stream.pipe(concat(buf => {
          resolve(buf)
        }))
      }))
    }
  })
}

const writeToFile = async (stream, streamPath) => {
  return await new Promise(async (resolve, reject) => {
    const fileStream = fs.createWriteStream(streamPath)
    fileStream.on('close', async () => {
      resolve()
    })
    fileStream.on('error', err => {
      reject(err)
    })
    stream.pipe(fileStream)
  })
}
