import { logger } from '../utils/logger.js';

export const botConfig = {
  // =========================
  // BOT PRESENCE (מה שמשתמשים רואים מתחת לשם הבוט)
  // =========================
  presence: {
    status: "online",

    activities: [
      {
        // סטטוס מעוצב וצבעוני שמראה מי היצרן
        name: "✨ נוצר ע״י שאמטיקינג  👑 | Combo IL bot",
        type: 0,
      },
    ],
  },

  // =========================
  // COMMAND BEHAVIOR
  // =========================
  commands: {
    owners: process.env.OWNER_IDS?.split(",") || [],
    defaultCooldown: 3,
    deleteCommands: false,
    testGuildId: process.env.TEST_GUILD_ID,
    prefix: process.env.PREFIX || "!",
  },

  // =========================
  // APPLICATIONS SYSTEM (מערכת הגשת טפסים)
  // =========================
  applications: {
    defaultQuestions: [
      { question: "מה השם שלך?", required: true },
      { question: "בן/בת כמה את/ה?", required: true },
      { question: "למה את/ה רוצה להצטרף?", required: true },
    ],

    statusColors: {
      pending: "#FFA500",
      approved: "#00FF00",
      denied: "#FF0000",
    },

    applicationCooldown: 24,
    deleteDeniedAfter: 7,
    deleteApprovedAfter: 30,
    managerRoles: [], 
  },

  // =========================
  // EMBED COLORS & BRANDING
  // =========================
  embeds: {
    colors: {
      primary: "#336699",
      secondary: "#2F3136",

      success: "#57F287",
      error: "#ED4245",
      warning: "#FEE75C",
      info: "#3498DB",

      light: "#FFFFFF",
      dark: "#202225",
      gray: "#99AAB5",

      blurple: "#5865F2",
      green: "#57F287",
      yellow: "#FEE75C",
      fuchsia: "#EB459E",
      red: "#ED4245",
      black: "#000000",

      giveaway: {
        active: "#57F287",
        ended: "#ED4245",
      },
      ticket: {
        open: "#57F287",
        claimed: "#FAA61A",
        closed: "#ED4245",
        pending: "#99AAB5",
      },
      economy: "#F1C40F",
      birthday: "#E91E63",
      moderation: "#9B59B6",

      priority: {
        none: "#95A5A6",
        low: "#3498db",
        medium: "#2ecc71",
        high: "#f1c40f",
        urgent: "#e74c3c",
      },
    },
    footer: {
      // שם הבוט עודכן כאן
      text: "Combo IL bot",
      icon: null,
    },
    thumbnail: null,
    author: {
      name: null,
      icon: null,
      url: null,
    },
  },

  // =========================
  // ECONOMY SETTINGS (מערכת כלכלה)
  // =========================
  economy: {
    currency: {
      name: "מטבעות",
      namePlural: "מטבעות",
      symbol: "🪙", // שיניתי למיצג מטבע יפה יותר, מוזמן להחזיר ל-$ אם תרצה
    },

    startingBalance: 0,
    baseBankCapacity: 100000,
    dailyAmount: 100,
    workMin: 10,
    workMax: 100,
    begMin: 5,
    begMax: 50,
    robSuccessRate: 0.4,
    robFailJailTime: 3600000,
  },

  // =========================
  // SHOP SETTINGS
  // =========================
  shop: {},

  // =========================
  // TICKET SYSTEM (מערכת טיקטים)
  // =========================
  tickets: {
    defaultCategory: null,
    supportRoles: [],

    priorities: {
      none: {
        emoji: "⚪",
        color: "#95A5A6",
        label: "ללא",
      },
      low: {
        emoji: "🟢",
        color: "#2ECC71",
        label: "נמוכה",
      },
      medium: {
        emoji: "🟡",
        color: "#F1C40F",
        label: "בינונית",
      },
      high: {
        emoji: "🔴",
        color: "#E74C3C",
        label: "גבוהה",
      },
      urgent: {
        emoji: "🚨",
        color: "#E91E63",
        label: "דחופה מאוד!",
      },
    },

    defaultPriority: "none",
    archiveCategory: null,
    logChannel: null,
  },

  // =========================
  // GIVEAWAY SETTINGS (הגרלות)
  // =========================
  giveaways: {
    defaultDuration: 86400000,
    minimumWinners: 1,
    maximumWinners: 10,
    minimumDuration: 300000,
    maximumDuration: 2592000000,
    allowedRoles: [],
    bypassRoles: [],
  },

  // =========================
  // BIRTHDAY SETTINGS (ימי הולדת)
  // =========================
  birthday: {
    defaultRole: null,
    announcementChannel: null,
    timezone: "Asia/Jerusalem", // שונה לשעון ישראל כברירת מחדל לבוט ישראלי
  },

  // =========================
  // VERIFICATION SETTINGS (אימות משתמשים)
  // =========================
  verification: {
    defaultMessage: "לחץ על הכפתור למטה כדי לאמת את החשבון שלך ולקבל גישה לשרת!",
    defaultButtonText: "אימות חשבון 🛡️",

    autoVerify: {
      defaultCriteria: "none",
      defaultAccountAgeDays: 7,
      serverSizeThreshold: 1000,
      minAccountAge: 1,
      maxAccountAge: 365,
      sendDMNotification: true,

      criteria: {
        account_age: "החשבון חייב להיות ותיק יותר ממספר הימים שהוגדרו",
        server_size: "כל המשתמשים מאומתים אוטומטית אם בשרת יש פחות מ-1000 חברים",
        none: "כל המשתמשים מאומתים מיידית"
      }
    },

    verificationCooldown: 5000,
    maxVerificationAttempts: 3,
    attemptWindow: 60000,
    maxCooldownEntries: 10000,
    maxAttemptEntries: 10000,
    cooldownCleanupInterval: 300000,
    maxAuditMetadataBytes: 4096,
    maxInMemoryAuditEntries: 1000,
    logAllVerifications: true,
    keepAuditTrail: true,
  },

  // =========================
  // WELCOME / GOODBYE MESSAGES (הודעות ברוכים הבאים ועזיבה)
  // =========================
  welcome: {
    defaultWelcomeMessage:
      "ברוך הבא {user} לשרת {server}! בזכותך אנחנו כבר {memberCount} חברים! 🎉",
    defaultGoodbyeMessage:
      "{user} עזב את השרת. נשארנו עם {memberCount} חברים.",
    defaultWelcomeChannel: null,
    defaultGoodbyeChannel: null,
  },

  // =========================
  // COUNTER CHANNELS (תעלות מוני משתמשים)
  // =========================
  counters: {
    defaults: {
      name: "מונה {name}",
      description: "מונה {name} של השרת",
      type: "voice",
      channelName: "{name}-{count}",
    },
    permissions: {
      deny: ["VIEW_CHANNEL"],
      allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK"],
    },
    messages: {
      created: "✅ המונה **{name}** נוצר בהצלחה",
      deleted: "🗑️ המונה **{name}** נמחק",
      updated: "🔄 המונה **{name}** עודכן",
    },
    types: {
      members: {
        name: "👥 סה״כ חברים",
        description: "סה״כ משתמשים בשרת",
        getCount: (guild) => guild.memberCount.toString(),
      },
      bots: {
        name: "🤖 בוטים",
        description: "סה״כ בוטים בשרת",
        getCount: (guild) =>
          guild.members.cache.filter((m) => m.user.bot).size.toString(),
      },
      members_only: {
        name: "👤 בני אדם",
        description: "סה״כ משתמשים אמיתיים (ללא בוטים)",
        getCount: (guild) =>
          guild.members.cache.filter((m) => !m.user.bot).size.toString(),
      },
    },
  },

  // =========================
  // GENERIC BOT MESSAGES (הודעות כלליות של הבוט)
  // =========================
  messages: {
    noPermission: "אין לך הרשאה מתאימה להשתמש בפקודה זו.",
    cooldownActive: "בבקשה המתן {time} לפני שתשתמש בפקודה זו שוב.",
    errorOccurred: "התרחשה שגיאה בזמן ביצוע הפקודה הזו.",
    missingPermissions: "חסרות לי הרשאות בשרת כדי לבצע את הפעולה הזו.",
    commandDisabled: "פקודה זו כבויה כרגע.",
    maintenanceMode: "הבוט נמצא כרגע במצב תחזוקה.",
  },

  // =========================
  // FEATURE TOGGLES
  // =========================
  features: {
    economy: true,
    leveling: true,
    moderation: true,
    logging: true,
    welcome: true,
    tickets: true,
    giveaways: true,
    birthday: true,
    counter: true,
    verification: true,
    reactionRoles: true,
    joinToCreate: true,
    voice: true,
    search: true,
    tools: true,
    utility: true,
    community: true,
    fun: true,
  },
};

export function validateConfig(config) {
  const errors = [];

  if (process.env.NODE_ENV !== 'production') {
    logger.debug('Environment variables check:');
    logger.debug('DISCORD_TOKEN exists:', !!process.env.DISCORD_TOKEN);
    logger.debug('TOKEN exists:', !!process.env.TOKEN);
    logger.debug('CLIENT_ID exists:', !!process.env.CLIENT_ID);
    logger.debug('GUILD_ID exists:', !!process.env.GUILD_ID);
    logger.debug('POSTGRES_HOST exists:', !!process.env.POSTGRES_HOST);
    logger.debug('NODE_ENV:', process.env.NODE_ENV);
  }

  if (!process.env.DISCORD_TOKEN && !process.env.TOKEN) {
    errors.push("Bot token is required (DISCORD_TOKEN or TOKEN environment variable)");
  }

  if (!process.env.CLIENT_ID) {
    errors.push("Client ID is required (CLIENT_ID environment variable)");
  }

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.POSTGRES_HOST) {
      errors.push("PostgreSQL host is required in production (POSTGRES_HOST environment variable)");
    }
    if (!process.env.POSTGRES_USER) {
      errors.push("PostgreSQL user is required in production (POSTGRES_USER environment variable)");
    }
    if (!process.env.POSTGRES_PASSWORD) {
      errors.push("PostgreSQL password is required in production (POSTGRES_PASSWORD environment variable)");
    }
  }

  return errors;
}

const configErrors = validateConfig(botConfig);
if (configErrors.length > 0) {
  logger.error("Bot configuration errors:", configErrors.join("\n"));
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
}

export const BotConfig = botConfig;

export function getColor(path, fallback = "#99AAB5") {
  if (typeof path === "number") return path;
  if (typeof path === "string" && path.startsWith("#")) {
    return parseInt(path.replace("#", ""), 16);
  }
  const result = path
    .split(".")
    .reduce(
      (obj, key) => (obj && obj[key] !== undefined ? obj[key] : fallback),
      botConfig.embeds.colors,
    );
  
  if (typeof result === "string" && result.startsWith("#")) {
    return parseInt(result.replace("#", ""), 16);
  }
  return result;
}

export function getRandomColor() {
  const colors = Object.values(botConfig.embeds.colors).flatMap((color) =>
    typeof color === "string" ? color : Object.values(color),
  );
  return colors[Math.floor(Math.random() * colors.length)];
}

export default botConfig;
