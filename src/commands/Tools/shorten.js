import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("shorten")
        .setDescription("קיצור קישורים (URL) באמצעות השירות is.gd")
        .addStringOption(option =>
            option
                .setName("url")
                .setDescription("הקישור שברצונך לקצר")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("custom")
                .setDescription("סיומת מותאמת אישית לקישור (אופציונלי)")
                .setRequired(false)
        )
        .setDMPermission(false),
    category: "Tools",

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral
        });
        if (!deferSuccess) {
            logger.warn(`Shorten interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'shorten'
            });
            return;
        }

        try {
            const url = interaction.options.getString("url");
            const custom = interaction.options.getString("custom");

            try {
                new URL(url);
            } catch (e) {
                return replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'פורמט הקישור אינו תקין. יש לכלול http:// או https://',
                });
            }

            if (custom && !/^[a-zA-Z0-9_-]+$/.test(custom)) {
                return replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'הסיומת המותאמת אישית יכולה להכיל אותיות באנגלית, מספרים, קו תחתון ומקפים בלבד.',
                });
            }

            let apiUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`;
            if (custom) {
                apiUrl += `&shorturl=${encodeURIComponent(custom)}`;
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            let response;
            try {
                response = await fetch(apiUrl, {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'ComboIL Bot URL Shortener/1.0'
                    }
                });
            } catch (networkError) {
                const message = networkError?.name === 'AbortError'
                    ? 'בקשת קיצור הקישור חרגה מזמן ההמתנה המקסימלי. אנא נסו שוב בעוד רגע.'
                    : 'לא ניתן לגשת לשירות קיצור הקישורים כרגע. אנא נסו שוב מאוחר יותר.';
                return replyUserError(interaction, {
                    type: ErrorTypes.NETWORK,
                    message,
                });
            } finally {
                clearTimeout(timeout);
            }

            if (!response.ok) {
                return replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: `שירות קיצור הקישורים החזיר שגיאה HTTP ${response.status}. אנא נסו שוב מאוחר יותר.`,
                });
            }

            const shortUrl = await response.text();

            try {
                new URL(shortUrl);
            } catch (e) {
                if (shortUrl.includes("already exists")) {
                    return replyUserError(interaction, {
                        type: ErrorTypes.VALIDATION,
                        message: 'הסיומת המותאמת אישית הזו כבר תפוסה. נסו לבחור סיומת אחרת.',
                    });
                } else if (shortUrl.includes("invalid")) {
                    return replyUserError(interaction, {
                        type: ErrorTypes.VALIDATION,
                        message: 'הקישור שסיפקת אינו תקין. יש לכלול http:// או https://',
                    });
                }
                return replyUserError(interaction, {
                    type: ErrorTypes.UNKNOWN,
                    message: `קיצור הקישור נכשל: ${shortUrl}`,
                });
            }

            const embed = successEmbed('🔗 הקישור קוצר בהצלחה', `הנה הקישור המקוצר שלך: ${shortUrl}`);
            embed.setColor(getColor('success'));
            embed.setFooter({ text: 'Combo IL • אמטיקינג יצר את זה' });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
            });
        } catch (error) {
            await handleInteractionError(interaction, error, {
                type: 'command',
                commandName: 'shorten'
            });
        }
    },
};
