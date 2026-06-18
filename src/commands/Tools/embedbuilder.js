import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ChannelSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ComponentType,
    ChannelType,
    EmbedBuilder,
    LabelBuilder,
    RadioGroupBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';

const MAX_FIELDS = 25;
const IDLE_TIMEOUT = 900_000; 

const COLOR_PRESETS = [
    { label: 'ראשי (כחול)',         value: '#336699', emoji: '' },
    { label: 'הצלחה (ירוק)',       value: '#57F287', emoji: '' },
    { label: 'שגיאה (אדום)',         value: '#ED4245', emoji: '' },
    { label: 'אזהרה (צהוב)',        value: '#FEE75C', emoji: '' },
    { label: 'מידע (כחול בהיר)',    value: '#3498DB', emoji: '' },
    { label: 'בלרפל (דיסקורד)',     value: '#5865F2', emoji: '' },
    { label: 'פוקסיה',              value: '#EB459E', emoji: '' },
    { label: 'זהב',                 value: '#F1C40F', emoji: '' },
    { label: 'לבן',                 value: '#FFFFFF', emoji: '' },
    { label: 'כהה',                 value: '#202225', emoji: '' },
    { label: 'קוד Hex מותאם אישית...', value: '__custom__', emoji: '' },
];

function isValidUrl(str) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function isValidHex(str) {
    return /^#[0-9A-Fa-f]{6}$/.test(str);
}

function buildPreviewEmbed(state) {
    const embed = new EmbedBuilder();

    if (state.title)       embed.setTitle(state.title.substring(0, 256));
    if (state.description) embed.setDescription(state.description.substring(0, 4096));

    try {
        embed.setColor(state.color || getColor('primary'));
    } catch {
        embed.setColor(getColor('primary'));
    }

    if (state.author?.name) {
        const obj = { name: state.author.name.substring(0, 256) };
        if (state.author.iconUrl && isValidUrl(state.author.iconUrl)) obj.iconURL = state.author.iconUrl;
        if (state.author.url   && isValidUrl(state.author.url))      obj.url     = state.author.url;
        embed.setAuthor(obj);
    }

    if (state.footer?.text) {
        const obj = { text: state.footer.text.substring(0, 2048) };
        if (state.footer.iconUrl && isValidUrl(state.footer.iconUrl)) obj.iconURL = state.footer.iconUrl;
        embed.setFooter(obj);
    }

    if (state.thumbnail && isValidUrl(state.thumbnail)) embed.setThumbnail(state.thumbnail);
    if (state.image     && isValidUrl(state.image))     embed.setImage(state.image);
    if (state.timestamp) embed.setTimestamp();

    if (state.fields.length > 0) embed.addFields(state.fields.slice(0, 25));

    if (
        !state.title &&
        !state.description &&
        state.fields.length === 0 &&
        !state.author?.name
    ) {
        embed.setDescription('*(ריק — השתמשו בתפריט למטה כדי להוסיף תוכן)*');
    }

    return embed;
}

function buildDashboardEmbed(state) {
    const trunc = (str, n) =>
        str.length > n ? str.substring(0, n) + '…' : str;

    const lines = [
        `**כותרת** › ${state.title ? `\`${trunc(state.title, 40)}\`` : '`לא הוגדרה`'}`,
        `**תיאור** › ${state.description ? `${state.description.length} תווים` : '`לא הוגדר`'}`,
        `**צבע** › ${state.color ? `\`${state.color}\`` : '`ברירת מחדל`'}`,
        `**יוצר (Author)** › ${state.author?.name ? `\`${trunc(state.author.name, 30)}\`` : '`לא הוגדר`'}`,
        `**תחתית (Footer)** › ${state.footer?.text ? `\`${trunc(state.footer.text, 30)}\`` : '`לא הוגדרה`'}`,
        `**תמונה ממוזערת** › ${state.thumbnail ? '✅ הוגדרה' : '`לא הוגדרה`'}`,
        `**תמונה גדולה** › ${state.image ? '✅ הוגדרה' : '`לא הוגדרה`'}`,
        `**חותם זמן** › ${state.timestamp ? '✅ מופעל' : '`מושבת`'}`,
        `**שדות (Fields)** › ${state.fields.length} / ${MAX_FIELDS}`,
    ];

    return new EmbedBuilder()
        .setTitle('יוצר ה-Embeds — לוח בקרה')
        .setDescription(lines.join('\n'))
        .setColor(getColor('info'))
        .setFooter({ text: 'התצוגה המקדימה למעלה מתעדכנת בזמן אמת · ייסגר לאחר 5 דקות של חוסר פעילות' });
}

function buildMainMenu(state) {
    const select = new StringSelectMenuBuilder()
        .setCustomId('eb_menu')
        .setPlaceholder('בחרו פעולה...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('עריכת תוכן')
                .setDescription('הגדרת הכותרת והתיאור של ה-Embed')
                .setValue('edit_content')
                .setEmoji('✏️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('הגדרת צבע')
                .setDescription('בחירת צבע מוכן מראש או הזנת קוד Hex מותאם אישית')
                .setValue('set_color')
                .setEmoji('🎨'),
            new StringSelectMenuOptionBuilder()
                .setLabel('הגדרת יוצר (Author)')
                .setDescription('הגדרת בלוק היוצר בחלק העליון של ה-Embed')
                .setValue('set_author')
                .setEmoji('👤'),
            new StringSelectMenuOptionBuilder()
                .setLabel('הגדרת תחתית (Footer)')
                .setDescription('הגדרת טקסט ותמונת האייקון בתחתית ה-Embed')
                .setValue('set_footer')
                .setEmoji('📄'),
            new StringSelectMenuOptionBuilder()
                .setLabel('הגדרת תמונות')
                .setDescription('הגדרת תמונה ממוזערת או באנר תמונה גדול')
                .setValue('set_images')
                .setEmoji('🖼️'),
            new StringSelectMenuOptionBuilder()
                .setLabel(`הוספת שדה (${state.fields.length}/${MAX_FIELDS})`)
                .setDescription('הוספת שדה חדש (שורתי או חסום)')
                .setValue('add_field')
                .setEmoji('➕'),
        );

    if (state.fields.length > 0) {
        select.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('עריכת שדה')
                .setDescription('שינוי השם, התוכן או הגדרת השורה של שדה קיים')
                .setValue('edit_field')
                .setEmoji('📝'),
            new StringSelectMenuOptionBuilder()
                .setLabel('הסרת שדה')
                .setDescription('מחיקת שדה מה-Embed')
                .setValue('remove_field')
                .setEmoji('➖'),
        );

        if (state.fields.length >= 2) {
            select.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('שינוי סדר השדות')
                    .setDescription('הזזת שדה למעלה או למטה ברשימה')
                    .setValue('reorder_fields')
                    .setEmoji('↕️'),
            );
        }
    }

    select.addOptions(
        new StringSelectMenuOptionBuilder()
            .setLabel(state.timestamp ? 'השבתת חותם זמן' : 'הפעלת חותם זמן')
            .setDescription('הפעלה או כיבוי של חותם הזמן האוטומטי בתחתית')
            .setValue('toggle_timestamp')
            .setEmoji('🕐'),
        new StringSelectMenuOptionBuilder()
            .setLabel('פרסום ה-Embed')
            .setDescription('שליחת ה-Embed המוכן לערוץ לבחירתכם')
            .setValue('post_embed')
            .setEmoji('📤'),
        new StringSelectMenuOptionBuilder()
            .setLabel('הצגת קוד JSON / נתונים גולמיים')
            .setDescription('הצגת מבנה ה-JSON הגולמי של ה-Embed הזה')
            .setValue('json_export')
            .setEmoji('📋'),
        new StringSelectMenuOptionBuilder()
            .setLabel('איפוס הכל')
            .setDescription('ניקוי כל השדות והתחלה מחדש')
            .setValue('reset_all')
            .setEmoji('🗑️'),
    );

    return select;
}

async function refreshDashboard(interaction, state) {
    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [buildPreviewEmbed(state), buildDashboardEmbed(state)],
        components: [new ActionRowBuilder().addComponents(buildMainMenu(state))],
    });
}

async function handleEditContent(selectInteraction, rootInteraction, state) {
    const modal = new ModalBuilder()
        .setCustomId('eb_content')
        .setTitle('עריכת תוכן')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('eb_title')
                    .setLabel('כותרת (מקסימום 256 תווים)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.title || '')
                    .setMaxLength(256)
                    .setRequired(false)
                    .setPlaceholder('הכותרת של ה-Embed שלי'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('eb_description')
                    .setLabel('תיאור (מקסימום 4000 תווים)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(state.description ? state.description.substring(0, 4000) : '')
                    .setMaxLength(4000)
                    .setRequired(false)
                    .setPlaceholder('כתבו את תיאור ה-Embed שלכם כאן...'),
            ),
        );

    const shown = await InteractionHelper.safeShowModal(selectInteraction, modal);
    if (!shown) return;

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'eb_content' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    await submitted.deferUpdate().catch(() => {});

    state.title       = submitted.fields.getTextInputValue('eb_title').trim()       || null;
    state.description = submitted.fields.getTextInputValue('eb_description').trim() || null;

    await refreshDashboard(rootInteraction, state);
}

async function handleSetColor(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate().catch(() => {});

    const colorSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_color_pick')
        .setPlaceholder('בחרו צבע...')
        .addOptions(
            COLOR_PRESETS.map(c =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(c.label)
                    .setValue(c.value)
                    .setEmoji(c.emoji)
                    .setDescription(c.value !== '__custom__' ? c.value : 'הזינו ערך #RRGGBB משלכם'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('הגדרת צבע')
                .setDescription(
                    'בחרו צבע מוכן מראש מהרשימה או בחרו ב-**קוד Hex מותאם אישית** כדי להזין ערך `#RRGGBB` משלכם.',
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(colorSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const colorCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_color_pick',
        time: 60_000,
        max: 1,
    });

    colorCollector.on('collect', async colorInter => {
        try {
            const picked = colorInter.values[0];

            if (picked === '__custom__') {
                const hexModal = new ModalBuilder()
                    .setCustomId('eb_custom_hex')
                    .setTitle('צבע מותאם אישית')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('hex_value')
                                .setLabel('קוד צבע בפורמט Hex')
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder('#5865F2')
                                .setMaxLength(7)
                                .setMinLength(7)
                                .setRequired(true),
                        ),
                    );

                const shown = await InteractionHelper.safeShowModal(colorInter, hexModal);
                if (!shown) return;

                const hexSubmit = await colorInter
                    .awaitModalSubmit({
                        filter: i =>
                            i.customId === 'eb_custom_hex' && i.user.id === colorInter.user.id,
                        time: 60_000,
                    })
                    .catch(() => null);

                if (!hexSubmit) return;

                const hex = hexSubmit.fields.getTextInputValue('hex_value').trim();
                if (!isValidHex(hex)) {
                    await replyUserError(hexSubmit, {
                        type: ErrorTypes.USER_INPUT,
                        message: `\`${hex}\` אינו קוד צבע תקני בפורמט hex. השתמשו בפורמט \`#RRGGBB\` (לדוגמה \`#5865F2\`).`,
                    });
                    return;
                }

                state.color = hex;
                await hexSubmit.deferUpdate().catch(() => {});
            } else {
                state.color = picked;
                await colorInter.deferUpdate().catch(() => {});
            }

            await refreshDashboard(rootInteraction, state);
        } catch (error) {
            logger.warn('Embed builder color picker interaction failed:', error.message);
        }
    });
}

async function handleSetAuthor(selectInteraction, rootInteraction, state) {
    const modal = new ModalBuilder()
        .setCustomId('eb_author')
        .setTitle('הגדרת יוצר (Author)')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('author_name')
                    .setLabel('שם היוצר (השאירו ריק להסרה)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.author?.name || '')
                    .setMaxLength(256)
                    .setRequired(false)
                    .setPlaceholder('השם שלכם'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('author_icon')
                    .setLabel('קישור לאייקון היוצר (אופציונלי)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.author?.iconUrl || '')
                    .setRequired(false)
                    .setPlaceholder('https://example.com/icon.png'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('author_url')
                    .setLabel('קישור ללחיצה על שם היוצר (אופציונלי)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.author?.url || '')
                    .setRequired(false)
                    .setPlaceholder('https://example.com'),
            ),
        );

    const shown = await InteractionHelper.safeShowModal(selectInteraction, modal);
    if (!shown) return;

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'eb_author' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const name    = submitted.fields.getTextInputValue('author_name').trim();
    const iconUrl = submitted.fields.getTextInputValue('author_icon').trim();
    const url     = submitted.fields.getTextInputValue('author_url').trim();

    if (iconUrl && !isValidUrl(iconUrl)) {
        await replyUserError(submitted, {
            type: ErrorTypes.USER_INPUT,
            message: 'קישור האייקון של היוצר חייב להיות כתובת אינטרנט תקנית המתחילה ב-\`https://\`.',
        });
        return;
    }
    if (url && !isValidUrl(url)) {
        await replyUserError(submitted, {
            type: ErrorTypes.USER_INPUT,
            message: 'הקישור של היוצר חייב להיות כתובת אינטרנט תקנית המתחילה ב-\`https://\`.',
        });
        return;
    }

    state.author = name ? { name, iconUrl: iconUrl || null, url: url || null } : null;

    await submitted.deferUpdate().catch(() => {});
    await refreshDashboard(rootInteraction, state);
}

async function handleSetFooter(selectInteraction, rootInteraction, state) {
    const modal = new ModalBuilder()
        .setCustomId('eb_footer')
        .setTitle('הגדרת תחתית (Footer)')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('footer_text')
                    .setLabel('טקסט התחתית (השאירו ריק להסרה)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.footer?.text || '')
                    .setMaxLength(2048)
                    .setRequired(false)
                    .setPlaceholder('נוצר באמצעות Combo IL'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('footer_icon')
                    .setLabel('קישור לאייקון התחתית (אופציונלי)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.footer?.iconUrl || '')
                    .setRequired(false)
                    .setPlaceholder('https://example.com/icon.png'),
            ),
        );

    const shown = await InteractionHelper.safeShowModal(selectInteraction, modal);
    if (!shown) return;

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'eb_footer' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const text    = submitted.fields.getTextInputValue('footer_text').trim();
    const iconUrl = submitted.fields.getTextInputValue('footer_icon').trim();

    if (iconUrl && !isValidUrl(iconUrl)) {
        await replyUserError(submitted, {
            type: ErrorTypes.USER_INPUT,
            message: 'קישור האייקון של התחתית חייב להיות כתובת אינטרנט תקנית המתחילה ב-\`https://\`.',
        });
        return;
    }

    state.footer = text ? { text, iconUrl: iconUrl || null } : null;

    await submitted.deferUpdate().catch(() => {});
    await refreshDashboard(rootInteraction, state);
}

async function handleSetImages(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate().catch(() => {});

    const imageSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_image_pick')
        .setPlaceholder('מה ברצונכם לשנות?')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('הגדרת תמונה ממוזערת (Thumbnail)')
                .setDescription('תמונה קטנה המוצגת בפינה הימנית/השמאלית העליונה')
                .setValue('set_thumbnail')
                .setEmoji('🖼️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('הגדרת תמונה גדולה (Image)')
                .setDescription('באנר תמונה ברוחב מלא המופיע בחלק התחתון')
                .setValue('set_image')
                .setEmoji('📸'),
            new StringSelectMenuOptionBuilder()
                .setLabel('מחיקת תמונה ממוזערת')
                .setDescription('הסרת התמונה הממוזערת הנוכחית')
                .setValue('clear_thumbnail')
                .setEmoji('🗑️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('מחיקת תמונה גדולה')
                .setDescription('הסרת הבאנר והתמונה הגדולה הנוכחית')
                .setValue('clear_image')
                .setEmoji('🗑️'),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('הגדרת תמונות')
                .setDescription('ביחרו האם ברצונכם להגדיר או להסיר תמונה מה-Embed.')
                .addFields(
                    { name: 'תמונה ממוזערת', value: state.thumbnail ? `[צפייה](${state.thumbnail})` : '`לא הוגדרה`', inline: true },
                    { name: 'תמונה גדולה',   value: state.image     ? `[צפייה](${state.image})`     : '`לא הוגדרה`', inline: true },
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(imageSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const imgMenuCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_image_pick',
        time: 60_000,
        max: 1,
    });

    imgMenuCollector.on('collect', async imgInter => {
        try {
            const pick = imgInter.values[0];

            if (pick === 'clear_thumbnail') {
                state.thumbnail = null;
                await imgInter.deferUpdate();
                await refreshDashboard(rootInteraction, state);
                return;
            }
            if (pick === 'clear_image') {
                state.image = null;
                await imgInter.deferUpdate();
                await refreshDashboard(rootInteraction, state);
                return;
            }

            const isThumb = pick === 'set_thumbnail';

            const urlModal = new ModalBuilder()
                .setCustomId('eb_image_url')
                .setTitle(isThumb ? 'הגדרת תמונה ממוזערת' : 'הגדרת תמונה גדולה')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('image_url')
                            .setLabel('קישור ישיר לתמונה')
                            .setStyle(TextInputStyle.Short)
                            .setValue(isThumb ? (state.thumbnail || '') : (state.image || ''))
                            .setRequired(true)
                            .setPlaceholder('https://example.com/image.png'),
                    ),
                );

            const shown = await InteractionHelper.safeShowModal(imgInter, urlModal);
            if (!shown) return;

            const submitted = await imgInter
                .awaitModalSubmit({
                    filter: i =>
                        i.customId === 'eb_image_url' && i.user.id === imgInter.user.id,
                    time: 60_000,
                })
                .catch(() => null);

            if (!submitted) return;

            const url = submitted.fields.getTextInputValue('image_url').trim();
            if (!isValidUrl(url)) {
                await replyUserError(submitted, {
                    type: ErrorTypes.USER_INPUT,
                    message: 'קישור התמונה חייב להיות קישור תקני המתחיל ב-\`https://\` המוביל לתמונה נגישה ציבורית.',
                });
                return;
            }

            if (isThumb) state.thumbnail = url;
            else         state.image     = url;

            await submitted.deferUpdate().catch(() => {});
            await refreshDashboard(rootInteraction, state);
        } catch (error) {
            logger.warn('Embed builder image picker interaction failed:', error.message);
        }
    });
}

async function handleAddField(selectInteraction, rootInteraction, state) {
    if (state.fields.length >= MAX_FIELDS) {
        await selectInteraction.deferUpdate();
        await replyUserError(selectInteraction, {
            type: ErrorTypes.VALIDATION,
            message: `ניתן להוסיף לכל Embed מקסימום של ${MAX_FIELDS} שדות.`,
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId('eb_add_field')
        .setTitle('הוספת שדה');

    const fieldNameLabel = new LabelBuilder()
        .setLabel('שם השדה (מקסימום 256 תווים)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('field_name')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(256)
                .setRequired(true)
                .setPlaceholder('כותרת השדה'),
        );

    const fieldValueLabel = new LabelBuilder()
        .setLabel('תוכן השדה (מקסימום 1024 תווים)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('field_value')
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(1024)
                .setRequired(true)
                .setPlaceholder('כתבו את תוכן השדה כאן...'),
        );

    const inlineRadio = new RadioGroupBuilder()
        .setCustomId('field_inline')
        .setRequired(false)
        .addOptions([
            { label: 'לא — רוחב מלא', value: 'no' },
            { label: 'כן — שדות צמודים זה לצד זה', value: 'yes' },
        ]);

    const inlineLabel = new LabelBuilder()
        .setLabel('להציג בשורה אחת (Inline)?')
        .setRadioGroupComponent(inlineRadio);

    modal.addLabelComponents(fieldNameLabel, fieldValueLabel, inlineLabel);

    const shown = await InteractionHelper.safeShowModal(selectInteraction, modal);
    if (!shown) return;

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'eb_add_field' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const name     = submitted.fields.getTextInputValue('field_name').trim();
    const value    = submitted.fields.getTextInputValue('field_value').trim();
    const inline   = submitted.fields.getRadioGroup('field_inline') === 'yes';

    state.fields.push({ name, value, inline });

    await submitted.deferUpdate().catch(() => {});
    await refreshDashboard(rootInteraction, state);
}

async function handleEditField(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate();

    const pickSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_edit_field_pick')
        .setPlaceholder('בחרו שדה לעריכה...')
        .addOptions(
            state.fields.slice(0, 25).map((f, i) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${i + 1}. ${f.name.substring(0, 50)}`)
                    .setDescription(
                        `${f.value.substring(0, 80)}${f.value.length > 80 ? '…' : ''} · ${f.inline ? 'בשותף (Inline)' : 'בנפרד (Block)'}`,
                    )
                    .setValue(String(i))
                    .setEmoji('📝'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('עריכת שדה')
                .setDescription('בחרו מתוך הרשימה את השדה שברצונכם לשנות.')
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(pickSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const pickCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_edit_field_pick',
        time: 60_000,
        max: 1,
    });

    pickCollector.on('collect', async pickInter => {
        try {
            const idx   = parseInt(pickInter.values[0], 10);
            const field = state.fields[idx];
            if (!field) { await pickInter.deferUpdate(); return; }

            const modal = new ModalBuilder()
                .setCustomId('eb_edit_field_modal')
                .setTitle(`עריכת שדה מספר ${idx + 1}`);

            const editNameLabel = new LabelBuilder()
                .setLabel('שם השדה')
                .setTextInputComponent(
                    new TextInputBuilder()
                        .setCustomId('field_name')
                        .setStyle(TextInputStyle.Short)
                        .setValue(field.name)
                        .setMaxLength(256)
                        .setRequired(true),
                );

            const editValueLabel = new LabelBuilder()
                .setLabel('תוכן השדה')
                .setTextInputComponent(
                    new TextInputBuilder()
                        .setCustomId('field_value')
                        .setStyle(TextInputStyle.Paragraph)
                        .setValue(field.value.substring(0, 4000))
                        .setMaxLength(1024)
                        .setRequired(true),
                );

            const editInlineRadio = new RadioGroupBuilder()
                .setCustomId('field_inline')
                .setRequired(false)
                .addOptions([
                    { label: 'לא — רוחב מלא', value: 'no' },
                    { label: 'כן — שדות צמודים זה לצד זה', value: 'yes' },
                ]);
            
            if (field.inline) {
                editInlineRadio.setOptions([
                    { label: 'לא — רוחב מלא', value: 'no' },
                    { label: 'כן — שדות צמודים זה לצד זה', value: 'yes', default: true },
                ]);
            }

            const editInlineLabel = new LabelBuilder()
                .setLabel('להציג בשורה אחת (Inline)?')
                .setRadioGroupComponent(editInlineRadio);

            modal.addLabelComponents(editNameLabel, editValueLabel, editInlineLabel);

            const shown = await InteractionHelper.safeShowModal(pickInter, modal);
            if (!shown) return;

            const submitted = await pickInter
                .awaitModalSubmit({
                    filter: i =>
                        i.customId === 'eb_edit_field_modal' && i.user.id === pickInter.user.id,
                    time: 120_000,
                })
                .catch(() => null);

            if (!submitted) return;

            const name   = submitted.fields.getTextInputValue('field_name').trim();
            const value  = submitted.fields.getTextInputValue('field_value').trim();
            const inline = submitted.fields.getRadioGroup('field_inline') === 'yes';

            state.fields[idx] = { name, value, inline };

            await submitted.deferUpdate().catch(() => {});
            await refreshDashboard(rootInteraction, state);
        } catch (error) {
            logger.warn('Embed builder field edit interaction failed:', error.message);
        }
    });
}

async function handleRemoveField(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate();

    const pickSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_remove_field_pick')
        .setPlaceholder('בחרו שדה להסרה...')
        .addOptions(
            state.fields.slice(0, 25).map((f, i) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${i + 1}. ${f.name.substring(0, 50)}`)
                    .setDescription(
                        `${f.value.substring(0, 90)}${f.value.length > 90 ? '…' : ''}`,
                    )
                    .setValue(String(i))
                    .setEmoji('➖'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('הסרת שדה')
                .setDescription('בחרו מתוך הרשימה את השדה שברצונכם למחוק לצמיתות.')
                .setColor(getColor('warning')),
        ],
        components: [new ActionRowBuilder().addComponents(pickSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const removeCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_remove_field_pick',
        time: 60_000,
        max: 1,
    });

    removeCollector.on('collect', async removeInter => {
        await removeInter.deferUpdate();
        const idx = parseInt(removeInter.values[0], 10);
        state.fields.splice(idx, 1);
        await refreshDashboard(rootInteraction, state);
    });
}

async function handleReorderFields(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate();

    const pickSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_reorder_pick')
        .setPlaceholder('בחרו שדה להזזה...')
        .addOptions(
            state.fields.slice(0, 25).map((f, i) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${i + 1}. ${f.name.substring(0, 50)}`)
