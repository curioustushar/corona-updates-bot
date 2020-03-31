const {
    ChoiceFactory,
    ChoicePrompt,
    ComponentDialog,
    DialogSet,
    DialogTurnStatus,
    WaterfallDialog
} = require("botbuilder-dialogs");
const _ = require('lodash');

const data = require('../db/data');
const utils = require('../utils');

const OPTIONS_PROMPT = 'OPTIONS_PROMPT';
const USER_PROFILE = 'USER_PROFILE';
const WATERFALL_DIALOG = 'WATERFALL_DIALOG';
const options = ['ⓘ Info', '📞 Helpline', '📊 Stats', '🌐 News', '🇮🇳 News', '💻 Developer'];

class Dialog extends ComponentDialog {

    constructor(userState) {
        super('userProfileDialog');

        this.userProfile = userState.createProperty(USER_PROFILE);
        this.addDialog((new ChoicePrompt(OPTIONS_PROMPT)));

        const dialogs = new WaterfallDialog(WATERFALL_DIALOG);
        dialogs.steps = [
        	this.startStep.bind(this),
            this.summaryStep.bind(this)
         ];

        this.addDialog(dialogs);
        this.initialDialogId = WATERFALL_DIALOG;
    }

    async startStep(stepContext) {
        const activity = _.clone(_.get(stepContext, 'context._activity', {}));
        const from = _.get(activity, 'from', {});
        from.channelId = activity.channelId;
        // from.conversation = activity.conversation;
        // from.recipient = activity.recipient;
        const status = utils.upsert(utils.db, 'users', { id: from.id }, from);
        let prompt = 'Choose';
        if (status === 'created') {
            prompt = 'Please Choose from the options below.';
            utils.db.get('stats').update(`bot.${from.channelId}`, n => (n || 0) + 1).write();
        }

        return await stepContext.prompt(OPTIONS_PROMPT, {
            choices: ChoiceFactory.toChoices(options),
            prompt,
        });
    }

    async run(turnContext, accessor) {
        const dialogSet = new DialogSet(accessor);
        dialogSet.add(this);
        const dialogContext = await dialogSet.createContext(turnContext);
        const results = await dialogContext.continueDialog();
        if (results.status === DialogTurnStatus.empty) {
            await dialogContext.beginDialog(this.id);
        }
    }

    convertArrayToString(d, joiner = '') {
        let o = '';
        if (d && d.length) {
            if (joiner) o = d.join(`\n\n${joiner}\n\n`);
            else o = d.join('\n\n');
        }
        return o;
    }

    collectStats (stepContext, command) {
        utils.db.get('stats')
            .update('total', n => (n || 0) + 1)
            .update(command, n => (n || 0) + 1)
            .update('updatedAt', d => new Date())
            .write();
        const id = _.get(stepContext, 'context._activity.from.id', {});
        utils.db.get('users').find({ id })
            .update(`stats.${command}`, n => (n || 0) + 1)
            .update('updatedAt', d => new Date())
            .write();
    }

    async sendResponse(stepContext, data = [], joiner) {
        const text = this.convertArrayToString(data, joiner);
        return await stepContext.context.sendActivity(text);
    }

	async summaryStep(stepContext) {
        const command = _.get(stepContext, 'result.value');
        if (command) this.collectStats(stepContext, command);
        switch (command) {
            case 'ⓘ Info': {
                await this.sendResponse(stepContext, data.info);
                break;
            }
            case '📞 Helpline': {
                await this.sendResponse(stepContext, data.helpLineNumbers);
                break;
            }
            case '📊 Stats': {
                const statsWorld = await utils.getStats('World');
                const statsIndia = await utils.getStats('India', 'India');
                const statsIndiaGovtWeb = await utils.getIndiaStats();
                const indiaData = (statsIndiaGovtWeb.length) ? statsIndiaGovtWeb : statsIndia;
                const stats = [...statsWorld, ...indiaData, ...data.stats];
                await this.sendResponse(stepContext, stats);
                break;
            }
            case '🌐 News': {
                const news = await utils.getNews('World');
                await this.sendResponse(stepContext, news.articles, process.env.JOINER);
                break;
            }
            case '🇮🇳 News': {
                const news = await utils.getNews('India');
                await this.sendResponse(stepContext, news.articles, process.env.JOINER);
                break;
            }
            case '💻 Developer': {
                await this.sendResponse(stepContext, data.dev);
                break;
            }
            default: {
                break;
            }
        }

        return await stepContext.beginDialog(WATERFALL_DIALOG);
    }
}

module.exports = Dialog;