import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getColor } from '../../config/bot.js';

// ... (שאר הקבועים והפונקציות נשארים ללא שינוי כפי שהיו בקוד המקור)

const BASE_ALPHABETS = {
    'BIN': { base: 2, prefix: '0b', name: 'בינארי (Binary)', alphabet: '01' },
    'OCT': { base: 8, prefix: '0o', name: 'אוקטלי (Octal)', alphabet: '0-7' },
    'DEC': { base: 10, prefix: '', name: 'עשרוני (Decimal)', alphabet: '0-9' },
    'HEX': { base: 16, prefix: '0x', name: 'הקסדצימלי (Hexadecimal)', alphabet: '0-9A-F' },
    'B64': { base: 64, prefix: 'b64:', name: 'Base64', alphabet: 'A-Za-z0-9+/=' },
    'B36': { base: 36, prefix: '', name: 'Base36', alphabet: '0-9A-Z' },
    'B58': { base: 58, prefix: '', name: 'Base58', alphabet: '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz' },
    'B62': { base: 62, prefix: '', name: 'Base62', alphabet: '0-9A-Za-z' },
};

const BASE_NAMES = Object.entries(BASE_ALPHABETS).map(([key, { name }]) => ({ name: `${key} (${name})`, value: key }));

// ... (פונקציות parseBigIntFromBase ו-formatBigIntToBase נשארות כפי שהיו)

export default {
    data: new SlashCommandBuilder()
        .setName('baseconvert')
        .setDescription('המרה בין בסיסים מספריים שונים')
        .addStringOption(option =>
            option.setName('number')
                .setDescription('המספר להמרה')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('from')
                .setDescription('בסיס המקור')
                .setRequired(true)
                .addChoices(...BASE_NAMES))
        .addStringOption(option =>
            option.setName('to')
                .setDescription('בסיס היעד (ברירת מחדל: הצג את כל הבסיסים)')
                .setRequired(false)
                .addChoices(...BASE_NAMES)),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) return;

        try {
            const numberStr = interaction.options.getString('number').trim();
            const fromBase = interaction.options.getString('from');
            const toBase = interaction.options.getString('to');
            
            const { prefix: fromPrefix, name: fromName } = BASE_ALPHABETS[fromBase];
            
            const cleanNumber = fromPrefix && numberStr.startsWith(fromPrefix) 
                ? numberStr.slice(fromPrefix.length) 
                : numberStr;
            
            if (!cleanNumber) {
                return replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'עליך לספק מספר להמרה.\n\n**דוגמה:** `/baseconvert number:1010 from:BIN to:DEC`',
                });
            }
            
            const alphabet = BASE_ALPHABETS[fromBase].alphabet;
            const regex = new RegExp(`^[${alphabet}]+$`, 'i');
            
            if (!regex.test(cleanNumber)) {
                let examples = '';
                if (fromBase === 'BIN') examples = '\n\n**תקין:** 101, 1010, 11111 | **לא תקין:** 5 (הספרה 5 אינה מותרת)';
                else if (fromBase === 'OCT') examples = '\n\n**תקין:** 77, 123, 755 | **לא תקין:** 8 (מותר רק 0-7)';
                else if (fromBase === 'DEC') examples = '\n\n**תקין:** 42, 123, 999 | **לא תקין:** 12.34 (ללא נקודה עשרונית)';
                else if (fromBase === 'HEX') examples = '\n\n**תקין:** FF, A1B2, DEADBEEF | **לא תקין:** G (רק 0-9, A-F)';

                return replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: `המספר שסיפקת: \`${cleanNumber}\` אינו תואם לבסיס המקור.\n\nתווים מותרים: \`${alphabet}\`${examples}`,
                });
            }
            
            const decimalValue = parseBigIntFromBase(cleanNumber, fromBase);
            
            if (toBase) {
                const { prefix: toPrefix, name: toName } = BASE_ALPHABETS[toBase];
                const result = formatBigIntToBase(decimalValue, toBase);
                    
                const embed = successEmbed(
                    '🔄 תוצאת המרת בסיס',
                    `**מ-${fromName} (${fromBase}):** \`${fromPrefix}${cleanNumber}\`\n` +
                    `**ל-${toName} (${toBase}):** \`${toPrefix}${result}\`\n` +
                    `**עשרוני:** \`${decimalValue.toLocaleString()}\``
                ).setColor(getColor('success'));
                    
                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            } else {
                let description = `**קלט (${fromName}):** \`${fromPrefix}${cleanNumber}\`\n`;
                description += `**עשרוני:** \`${decimalValue.toLocaleString()}\`\n\n`;
                
                for (const [baseKey, { prefix, name }] of Object.entries(BASE_ALPHABETS)) {
                    if (baseKey === fromBase) continue;
                    try {
                        let value = formatBigIntToBase(decimalValue, baseKey);
                        description += `**${name} (${baseKey}):** \`${prefix}${value}\`\n`;
                    } catch {
                        description += `**${name} (${baseKey}):** *גדול מדי להמרה*\n`;
                    }
                }
                
                const embed = successEmbed('🔄 תוצאות המרת בסיס', description).setColor(getColor('primary'));
                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }
        } catch (error) {
            await handleInteractionError(interaction, error, { type: 'command', commandName: 'baseconvert' });
        }
    },
};
