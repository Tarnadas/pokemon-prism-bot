import Discord from 'discord.js'

// got is an easy to use library to make HTTP requests. We use it to download files
import got from 'got'

// this is the bsppatch.js file, slightly changed to support Node and minified with Google Closure Compiler
import bspPatch from './bsppatch'

import { botToken } from './secret'

const client = new Discord.Client()

// this is a damn long url I got from gbahacks.blogspot.com which contains the latest bsp patch file
// TODO is there any better repo for updated bsp files?
const bspUrl = 'https://goo.gl/9qatSQ';

const toArrayBuffer = buf => {
  let ab = new ArrayBuffer(buf.length)
  let view = new Uint8Array(ab)
  for (let i = 0; i < buf.length; ++i) {
    view[i] = buf[i]
  }
  return ab
}

// we want to have an asynchronous environment, so we call a self-executing asynchronous arrow function
(async () => {
  // Bot should keep its own copy of patch file. The user should not be prompted to upload it, to keep things as simple as possible
  const bsp = toArrayBuffer((await got(bspUrl)).body)

  client.login(botToken)

  client.on("ready", () => {
    console.log("I am ready!")
  })

  client.on("message", async message => {
    // if message comes from bot itself, return
    if (message.author.bot) return

    // if message is not a direct message, return
    if (message.channel.type !== 'dm') return

    // loop over sent attachments
    message.attachments.forEach(async attachment => {
      // download attachment to bot
      const file = toArrayBuffer((await got(attachment.url)).body)

      try {
        // check if attachment is valid Pokemon Prism file
        // TODO

        // PATCH IT BABY
        const patchedFile = await bspPatch(file, bsp)
        console.log(patchedFile)

        // send back to user
        message.author.send({ patchedFile })
      } catch (err) {
        // file was not able to be patched
        console.error(err)
      }
    })
  })
})()
