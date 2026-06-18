import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("support")
        .setDescription("מידע ודרכי פנייה לקבלת עזרה בשרת"),

    async execute(interaction) {
        try {
            await InteractionHelper.safeReply(interaction, {
                embeds: [
                    createEmbed({ 
                        title: "🛠️ זקוקים לעזרה או תמיכה?", 
                        description: "צוות הנהלת השרת כאן בשבילכם! אם נתקלתם בבעיה, מצאתם באג או שיש לכם הצעה לשיפור, אנא פתחו כרטיס תמיכה (Ticket) או פנו ישירות לאחד מחברי הצוות בערוצי הפניות." 
                    }),
                ],
                flags: MessageFlags.Ephemeral, // ההודעה גלויה רק למשתמש שביקש עזרה
            });
        } catch (error) {
            logger.error('Support command error:', error);
            
            try {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({ title: 'שגיאת מערכת', description: 'לא ניתן להציג את פרטי התמיכה כעת.', color: 'error' })],
                    flags: MessageFlags.Ephemeral,
                });
            } catch (replyError) {
                logger.error('Failed to send error reply:', replyError);
            }
        }
    },
};
