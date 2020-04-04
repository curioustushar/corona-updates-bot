require('console-stamp')(console, { pattern: 'dd/mm/yyyy HH:MM:ss.l' });
require('dotenv').config();
const restify = require('restify');
const {
    BotFrameworkAdapter,
    ConversationState,
    UserState,
    MemoryStorage,
} = require('botbuilder');

const Bot = require('./src/bot/bot');
const Dialog = require('./src/bot/dialog');

// Create bot adapter, which defines how the bot sends and receives messages.
const adapter = new BotFrameworkAdapter({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword
});

adapter.onTurnError = async (context, error) => {
    // This check writes out errors to console log .vs. app insights.
    // NOTE: In production environment, you should consider logging this to Azure
    //       application insights.
    console.error(error);
    console.error(`\n [onTurnError] unhandled error: ${error}`);

    // Send a trace activity, which will be displayed in Bot Framework Emulator
    await context.sendTraceActivity(
        'OnTurnError Trace',
        `${error}`,
        'https://www.botframework.com/schemas/error',
        'TurnError'
    );

    // Send a message to the user
    await context.sendActivity('The bot encounted an error or bug.');
    await context.sendActivity('To continue to run this bot, please fix the bot source code.');
    // Clear out state
    await conversationState.delete(context);
};

const memoryStorage = new MemoryStorage();

// Create conversation state with in-memory storage provider.
const conversationState = new ConversationState(memoryStorage);
const userState = new UserState(memoryStorage)

// Create HTTP server.
const server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log(`\n${server.name} listening to ${server.url}`);
});

// Create the main dialog.
const dialog = new Dialog(userState);
const bot = new Bot(conversationState, userState, dialog);
 
// Listen for incoming requests at /api/messages.
server.post('/api/messages', (req, res) => {
    // Use the adapter to process the incoming web request into a TurnContext object.
    adapter.processActivity(req, res, async (turnContext) => {
        if (turnContext.activity.type === 'message') {
            await bot.run(turnContext);
        }
    });
});