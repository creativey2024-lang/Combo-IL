import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SLUT_COOLDOWN = 45 * 60 * 1000;

const SLUT_ACTIVITIES = [
    { name: "שידור במצלמה (Cam Stream)", min: 120, max: 450, risk: 0.2 },
    { name: "ריקוד בחדר פרטי", min: 220, max: 700, risk: 0.25 },
    { name: "אירוח במועדון לילה", min: 320, max: 900, risk: 0.3 },
    { name: "ליווי בוקינג VIP", min: 550, max: 1400, risk: 0.35 },
    { name: "שידור חי בלעדי (Premium)", min: 850, max: 2200, risk: 0.4 },
];

const POSITIVE_OUTCOMES = [
    "השידור שלך התפוצץ והטיפים זרמו בלי הפסקה.",
    "הזמנת ה-VIP שילמה הרבה מעבר לממוצע.",
    "המשמרת שלך במועדון הייתה עמוסה ומאוד רווחית.",
    "בקשות פרימיום מיוחדות נכנסו והרווח שלך זינק.",
];

const FINE_OUTCOMES = [
    "האבטחה במקום הטילה עליך קנס על אי-עמידה בנהלים.",
    "התראת מודרציה הפעילה עמלת פלטפורמה שנכנסה לתוקף.",
    "סומנת במערכת ונאלצת לשלם קנס מנהלתי.",
];

const ROBBED_OUTCOMES = [
    "ביטול עסקה מצד קונה מזויף מחק חלק מהרווחים שלך.",
    "הזמנת עוקץ רוקנה לך חלק נכבד מהמזומנים.",
    "נפלת קורבן לחשבון מרמה והפסדת כסף.",
];

const LOSS_OUTCOMES = [
    "ההופעה נכשלה ונאלצת לכסות את עלויות התפעול בעצמך.",
    "שרפת תקציב על הכנות מוקדמות ולא ראית מזה שום החזר.",
    "המשמרת השתבשה לחלוטין והשאירה אותך בהפסדים.",
];

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function resolveOutcome(activity, wallet) {
    const successChance = Math.max(0.35, 0.55 - activity.risk * 0.2);
    const fineChance = 0.22;
    const robbedChance = 0.2;
    const roll = Math.random();

    if (roll < successChance) {
        const amount = randomInt(activity.min, activity.max);
        return {
            type: 'payout',
            delta: amount,
            message: randomChoice(POSITIVE_OUTCOMES),
            title: `${activity.name} - תשלום התקבל`
        };
    }

    const remainingAfterSuccess = roll - successChance;

    if (remainingAfterSuccess < fineChance) {
        const maxFine = Math.min(wallet, Math.max(150, Math.floor(activity.max * 0.4)));
        const minFine = Math.min(maxFine, Math.max(50, Math.floor(activity.min * 0.2)));
        const amount = maxFine > 0 ? randomInt(minFine, maxFine) : 0;
        return {
            type: 'fine',
            delta: -amount,
            message: randomChoice(FINE_OUTCOMES),
            title: `${activity.name} - קנס מנהלתי`
        };
    }

    if (remainingAfterSuccess < fineChance + robbedChance) {
        const maxRobbed = Math.min(wallet, Math.max(200, Math.floor(wallet * 0.35)));
        const minRobbed = Math.min(maxRobbed, Math.max(75, Math.floor(wallet * 0.1)));
        const amount = maxRobbed > 0 ? randomInt(minRobbed, maxRobbed) : 0;
        return {
            type: 'robbed',
            delta: -amount,
            message: randomChoice(ROBBED_OUTCOMES),
            title: `${activity.name} - נעקצת!`
        };
    }

    const maxLoss = Math.min(wallet, Math.max(100, Math.floor(activity.max * 0.3)));
    const minLoss = Math.min(maxLoss, Math.max(40, Math.floor(activity.min * 0.15)));
    const amount = maxLoss > 0 ? randomInt(minLoss, maxLoss) : 0;
    return {
        type: 'loss',
        delta: -amount,
        message: randomChoice(LOSS_OUTCOMES),
        title: `${activity.name} - הפסד כספי`
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName('slut')
        .setDescription('קח ג׳וב פרובוקטיבי ומסוכן עבור תשלום גבוה או הפסד כספי'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            logger.debug(`[ECONOMY] Slut command started for ${userId}`, { userId, guildId });

            const userData = await getEconomyData(client, guildId, userId);

            if (!userData) {
                throw createError(
                    "Failed to load economy data for slut command",
                    ErrorTypes.DATABASE,
                    "טעינת נתוני הכלכלה שלך נכשלה. אנא נסה שוב מאוחר יותר.",
                    { userId, guildId }
                );
            }

            const lastSlut = userData.lastSlut || 0;

            if (now - lastSlut < SLUT_COOLDOWN) {
                const remainingTime = lastSlut + SLUT_COOLDOWN - now;
                throw createError(
                    "Slut cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `אתה צריך לנוח קצת לפני שתוכל לעבוד שוב! נסה שוב בעוד **${Math.ceil(remainingTime / 60000)}** דקות.`,
                    { timeRemaining: remainingTime, cooldownType: 'slut' }
                );
            }

            const activity = randomChoice(SLUT_ACTIVITIES);

            const outcome = resolveOutcome(activity, userData.wallet || 0);

            userData.lastSlut = now;
            userData.totalSluts = (userData.totalSluts || 0) + 1;
            userData.totalSlutEarnings = (userData.totalSlutEarnings || 0) + Math.max(0, outcome.delta);
            userData.totalSlutLosses = (userData.totalSlutLosses || 0) + Math.max(0, -outcome.delta);

            if (outcome.type !== 'payout') {
                userData.failedSluts = (userData.failedSluts || 0) + 1;
            }

            userData.wallet = Math.max(0, (userData.wallet || 0) + outcome.delta);

            await setEconomyData(client, guildId, userId, userData);

            logger.info(`[ECONOMY_TRANSACTION] Slut activity resolved`, {
                userId,
                guildId,
                activity: activity.name,
                outcomeType: outcome.type,
                amountDelta: outcome.delta,
                newWallet: userData.wallet,
                timestamp: new Date().toISOString()
            });

            const amountLabel = `${outcome.delta >= 0 ? '+' : '-'}$${Math.abs(outcome.delta).toLocaleString()}`;
            const summaryLines = [
                `${outcome.message}`,
                `💸 **תוצאה נטו:** ${amountLabel}`,
                `💳 **יתרה נוכחית בארנק:** $${userData.wallet.toLocaleString()}`,
                `📊 **סה"כ משמרות:** ${userData.totalSluts}`,
                `💵 **סה"כ הרווחת:** $${(userData.totalSlutEarnings || 0).toLocaleString()}`,
                `🧾 **סה"כ הפסדת:** $${(userData.totalSlutLosses || 0).toLocaleString()}`
            ];

            const embed = createEmbed({
                title: outcome.title,
                description: summaryLines.join('\n'),
                color: outcome.delta >= 0 ? 'success' : 'error',
                timestamp: true
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'slut' })
};
