//
const
    _ = require("lodash")
  , fs = require("fs")
  , pkg = require("./package.json")
  , {env} = process
  , {MongoClient} = require("mongodb")
  , $$ = require("ansicolor").nice
  , log = require("ololog").configure({time: true})
  , {stringify: dump, print} = require("q-i")
  , Telegraf = require("telegraf")
  , Stage = require("telegraf/stage")
  , Session = require("telegraf-session-redis")
  , {keyboard, inlineKeyboard: inline, callbackButton: action, button} = require("telegraf/markup")
  , {HTML} = require("telegraf/extra")
  , Mixpanel = require("telegraf-mixpanel")
  , stage = new Stage([require("./wallet")])
  , wss = process.env.MINTER_WSS
  , Centrifuge = require("centrifuge")
  , WebSocket = require("ws")
  , mustache = require("mustache")
  // , patterns = require("./templates/hears.json")
  // , hears = _.mapValues(patterns, pattern => new RegExp(pattern, "i"))

class Bot extends Telegraf {
  constructor() {
    super(
      env.TELEGRAM_TOKEN,
      {polling: true}
    )

    this.use(new Session({getSessionKey: ({from}) => `${env.SESSIONS_KEY}:${from.id}`}))
    this.use(new Mixpanel(env.MIXPANEL_TOKEN).middleware())
    this.use(stage.middleware())

    this.context.$ = async (namespace) => (await MongoClient.connect(
      process.env.MONGODB_URI,
      {useNewUrlParser: true}
    ))
      .db(process.env.MONGODB_URI.split("/").pop())
      .collection(namespace)

    this.context.keyboards = _.mapValues(
      require("./keyboards.json"),
      buttons => keyboard([
        _.map(
          buttons,
          ([icon, label]) => `${icon} ${label}`
        )
      ])
        .resize()
        .extra()
    )

    this.context.templates = _.fromPairs(
      _.map(
        require("./templates.json"),
        name => [
          name,
          fs.readFileSync(`./templates/${name}.mst`).toString()
        ]
      )
    )
  }

  launch() {
    super.start(Stage.enter("wallet"))
    this.centrifuge = new Centrifuge(
      wss,
      {debug: false, websocket: WebSocket}
    )
    this.centrifuge.on("connect", context =>
      log("connected to".bright.yellow, `Minter ${process.env.MINTER_NETWORK}`.bright[process.env.BANNER_COLOR], dump(context))
    )
    this.centrifuge.subscribe("transactions").on("publish", async ({data: tx}) => {
      if (tx.type == 1) {
        const receiver = await (await this.context.$("users")).findOne({address: tx.data.to})
        if (receiver) {
          log("deposit".bright.green)
          // log(dump(tx))
          // log(dump(receiver))
          await this.telegram.sendMessage(receiver.id, `Deposit ${parseFloat(tx.data.value).toFixed(2)} ${tx.data.coin} from ${tx.from}`)
        }
      }
    })
    this.centrifuge.connect()
    super.launch()
  }
}

const bot = new Bot()

const help = async ({replyWithHTML, keyboards, templates, mixpanel}) => {
  await mixpanel.track("help")
  await replyWithHTML(
    mustache.render(templates.help, {}),
    keyboards.default
  )
}

bot.help(help)
bot.hears(/help|помощь|справка|man/i, help)

bot.launch()