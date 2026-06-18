import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import axios from 'axios';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getColor } from '../../config/bot.js';

export default {
    data: new SlashCommandBuilder()
        .setName('define')
        .setDescription('חיפוש הגדרה של מילה במילון')
        .addStringOption(option => 
            option.setName('word')
                .setDescription('המילה לחיפוש')
                .setRequired(true)),
    async execute(interaction) {
        try {
            
            const deferred = await InteractionHelper.safeDefer(interaction);
            if (!deferred) {
                return;
            }

            const word = interaction.options.getString('word');
            
            if (word.length < 2) {
                logger.warn('Define command - word too short', {
                    userId: interaction.user.id,
                    word: word,
                    guildId: interaction.guildId
                });
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'נא להזין מילה באורך של לפחות 2 תווים.' });
            }
            
            const response = await axios.get(
                `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
                { timeout: 5000 }
            );
            
            if (!response.data || response.data.length === 0) {
                return await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `לא נמצאו הגדרות עבור "${word}".` });
            }
            
            const data = response.data[0];
            const embed = createEmbed({
                title: data.word,
                description: data.phonetic ? `*${data.phonetic}*` : '',
            }).setColor(getColor('success'));
            
            data.meanings.slice(0, 5).forEach(meaning => {
                const definitions = meaning.definitions
                    .slice(0, 3)
                    .map((def, idx) => {
                        let text = `${idx + 1}. ${def.definition}`;
                        if (def.example) {
                            text += `\n *דוגמה: ${def.example}*`;
                        }
                        return text;
                    })
                    .join('\n\n');
            
                if (definitions) {
                    embed.addFields({
                        name: `**${meaning.partOfSpeech || 'הגדרה'}**`,
                        value: definitions,
                        inline: false
                    });
                }
            });
            
            embed.setFooter({ text: 'מופעל על ידי Free Dictionary API' });
            
            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            
            logger.info('Dictionary definition retrieved', {
                userId: interaction.user.id,
                word: word,
                guildId: interaction.guildId,
                commandName: 'define'
            });
            
        } catch (error) {
            logger.error('Dictionary lookup error', {
                error: error.message,
                userId: interaction.user.id,
                word: interaction.options.getString('word'),
                guildId: interaction.guildId,
                commandName: 'define'
            });

            if (error.response?.status === 404) {
                await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `לא נמצאו הגדרות עבור "${interaction.options.getString('word')}".` });
            } else {
                await handleInteractionError(interaction, error, {
                    commandName: 'define',
                    source: 'dictionary_api'
                });
            }
        }
    },
};
