const
    _ = require("lodash")
  , Extra = require("telegraf/extra")
  , $$ = require("ansicolor").nice
  , {stringify: dump, print} = require("q-i")
  , log = require("ololog").configure({time: true})
  , fs = require("fs")
  , pkg = require("./package.json")
  , mustache = require("mustache")
  , Wallet = require("minterjs-wallet")
  , util = require("minterjs-util")
  , TX = require("minterjs-tx")
  , {Minter, SendTxParams} = require("minter-js-sdk")
  , minter = new Minter({apiType: process.env.API_TYPE, baseURL: process.env.BASE_URL})
  , Scene = require("telegraf/scenes/base")
  , bot = module.exports = new Scene("wallet")
  , explorer = process.env.EXPLORER
  , axios = require("axios")
  , moment = require("moment")
  , coin = process.env.COIN
  , chain = {
        chainId: process.env.CHAIN_ID
      , coinSymbol: coin
      , feeCoinSymbol: coin
      , gasPrice: 1
      , message: String()
    }

bot.enter(async ({$, templates, keyboards, from, replyWithHTML, mixpanel, startPayload}) => {
  if (await (await $("users")).findOne({id: from.id})) {
    await mixpanel.track("restart")
  }
  else {
    const wallet = Wallet.generateWallet()
    const user = _.assign({}, from, {
        privateKey: wallet.getPrivateKeyString()
      , publicKey: wallet.getPublicKeyString()
      , mnemonic: wallet.getMnemonic()
      , address: wallet.getAddressString()
      , referrer: startPayload
    })
    await (await $("users")).insertOne(user)
    await mixpanel.track("start")
    await mixpanel.people.set({$created: new Date()})
  }
  await replyWithHTML(
    mustache.render(templates.welcome, pkg),
    keyboards.default
  )
})

bot.hears(/📨|receive|address|my|mine|get|я|мой|получить|адрес/i, async ({$, templates, keyboards, from, replyWithHTML, mixpanel}) => {
  const user = await (await $("users")).findOne({id: from.id})
  await mixpanel.track("receive")
  await replyWithHTML(
    mustache.render(templates.address, user),
    keyboards.default
  )
})

bot.hears(/👛|balance|coins|баланс|моё|счет|счёт/i, async ({$, templates, keyboards, from, replyWithHTML, mixpanel}) => {
  const user = await (await $("users")).findOne({id: from.id})
  await mixpanel.track("balance")
  const {data: {data}} = await axios.get(`${explorer}addresses/${user.address}`)
  // print(data)
  await replyWithHTML(
    mustache.render(templates.balance, data),
    keyboards.default
  )
})

bot.hears(/ℹ️|status|статус|сеть|инфо|network/i, async({$, templates, keyboards, from, replyWithHTML, mixpanel}) => {
  const user = await (await $("users")).findOne({id: from.id})
  await mixpanel.track("status")
  const {data: {data}} = await axios.get(`${explorer}status`)
  data.averageBlockTime = data.averageBlockTime.toFixed(2)
  data.transactionsPerSecond = data.transactionsPerSecond.toFixed(2)
  data.latestBlockTime = moment(data.latestBlockTime).fromNow()
  await replyWithHTML(
    mustache.render(templates.status, data),
    keyboards.default
  )
})

bot.hears(/(💸|send|tip|transfer|передать|послать|отправить|дать)$/i, async({$, templates, keyboards, from, replyWithHTML, mixpanel}) => {
  const user = await (await $("users")).findOne({id: from.id})
  await mixpanel.track("send")
  await replyWithHTML(
    mustache.render(templates.send, {}),
    keyboards.default
  )
})

bot.hears(/send\s+(([0-9]+([.][0-9]*)?|[.][0-9]+))\s+(\w+)\s+Mx(\w+)/i, async ({match, $, templates, keyboards, from, replyWithHTML, mixpanel}) => {
  const user = await (await $("users")).findOne({id: from.id})
  await mixpanel.track("transfer")
  const
      value = match[1]
    , amount = parseFloat(value)
    , coinSymbol = match[4]
    , address = `Mx${match[5]}`
    , fee = util.getFeeValue(TX.TX_TYPE_SEND)
    , nonce = await minter.getNonce(user.address)
    , amountnfee = amount + fee
  await replyWithHTML(
    mustache.render(templates.transfering, {amountnfee, amount, coinSymbol, address, fee, nonce, coin}),
    keyboards.default
  )
  const params = new SendTxParams(_.assign(
      {}
    , chain
    , {
          privateKey: user.privateKey
        , nonce
        , address
        , amount
      }
  ))
  minter.postTx(params)
    .then(async (hash) => await replyWithHTML(hash, keyboards.default))
    .catch(async error => {
      print(error)
      await replyWithHTML(`<pre>${dump(error)}</pre>`)
    })
})

bot.hears(/📜|history|transactions|история|учет/i, async ({match, $, templates, keyboards, from, replyWithHTML, mixpanel}) => {
  const user = await (await $("users")).findOne({id: from.id})
  await mixpanel.track("history")
  await replyWithHTML(
    mustache.render(templates.history, user),
    Extra.webPreview(false).markup(keyboards.default)
  )
})

bot.hears(/🚧|projects|проекты|products|продукты|еще|ещё/i, async ({match, $, templates, keyboards, from, replyWithHTML, mixpanel}) => {
  const user = await (await $("users")).findOne({id: from.id})
  await mixpanel.track("projects")
  await replyWithHTML(
    mustache.render(templates.projects, {year: new Date().year}),
    Extra.webPreview(false).markup(keyboards.default)
  )
})