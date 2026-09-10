import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ======================================================
// TELEGRAM HELPERS
// ======================================================

async function telegram(method: string, payload: any) {
  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  const json = await res.json();

  if (!json.ok) {
    console.error("Telegram error:", method, json);
  }

  return json;
}

async function sendMessage(chatId: number, text: string, replyMarkup?: any) {
  return await telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
    disable_web_page_preview: true,
  });
}

async function sendPhoto(chatId: number, fileId: string, caption?: string) {
  return await telegram("sendPhoto", {
    chat_id: chatId,
    photo: fileId,
    caption: caption || "",
    parse_mode: "HTML",
  });
}

function escapeHtml(value: any) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatDateKyiv(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function kyivDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = part.value;
  }

  return `${values.year}-${values.month}-${values.day}`;
}

// Converts a Europe/Kyiv local date/time to UTC without hardcoding +02/+03.
function kyivLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
) {
  const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);

  let guess = wanted;

  for (let i = 0; i < 3; i++) {
    const d = new Date(guess);

    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Kyiv",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(d);

    const values: Record<string, string> = {};

    for (const p of parts) {
      if (p.type !== "literal") values[p.type] = p.value;
    }

    const representedAsUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      0,
    );

    const diff = representedAsUtc - wanted;
    guess -= diff;

    if (Math.abs(diff) < 1000) break;
  }

  return new Date(guess).toISOString();
}

function parseVisitDate(text: string) {
  // Формат: 12.09.2026 14:30
  const match = text.trim().match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/,
  );

  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  if (
    month < 1 || month > 12 ||
    day < 1 || day > 31 ||
    hour < 0 || hour > 23 ||
    minute < 0 || minute > 59
  ) {
    return null;
  }

  const check = new Date(Date.UTC(year, month - 1, day));

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return kyivLocalToUtc(year, month, day, hour, minute);
}

// ======================================================
// KEYBOARDS
// ======================================================

const clientMenu = {
  keyboard: [
    [{ text: "☀️ Оставить заявку" }],
    [{ text: "📞 Связаться с менеджером" }],
  ],
  resize_keyboard: true,
};

const adminClientMenu = {
  keyboard: [
    [{ text: "☀️ Оставить заявку" }],
    [{ text: "📞 Связаться с менеджером" }],
    [{ text: "⚙️ Админ-панель" }],
  ],
  resize_keyboard: true,
};

const adminMenu = {
  keyboard: [
    [{ text: "⚙️ Админ-панель" }],
    [{ text: "📅 Мои задачи" }],
    [
      { text: "🆕 Новые заявки" },
      { text: "📞 Связаться" },
    ],
    [
      { text: "📐 Замеры" },
      { text: "🔧 Монтажи" },
    ],
    [
      { text: "👷 Монтажники" },
      { text: "📊 Статистика" },
    ],
    [{ text: "👤 Панель клиента" }],
  ],
  resize_keyboard: true,
};

const cancelKeyboard = {
  keyboard: [[{ text: "❌ Отменить заявку" }]],
  resize_keyboard: true,
};

const phoneKeyboard = {
  keyboard: [
    [{ text: "📲 Поделиться номером Telegram", request_contact: true }],
    [{ text: "✍️ Ввести другой номер" }],
    [{ text: "❌ Отменить заявку" }],
  ],
  resize_keyboard: true,
  one_time_keyboard: true,
};

const objectTypeKeyboard = {
  keyboard: [
    [{ text: "🏠 Частный дом" }],
    [{ text: "🏢 Бизнес / предприятие" }],
    [{ text: "🏭 Другой объект" }],
    [{ text: "❌ Отменить заявку" }],
  ],
  resize_keyboard: true,
};

const systemTypeKeyboard = {
  keyboard: [
    [{ text: "☀️ Солнечная станция под ключ" }],
    [{ text: "🔆 Солнечные панели" }],
    [{ text: "⚡ Инвертор" }],
    [{ text: "🔋 Аккумулятор" }],
    [{ text: "⚡ Инвертор + аккумулятор" }],
    [{ text: "❌ Отменить заявку" }],
  ],
  resize_keyboard: true,
};

const powerKeyboard = {
  keyboard: [
    [{ text: "6 кВт" }, { text: "8 кВт" }],
    [{ text: "12 кВт" }, { text: "15 кВт" }],
    [{ text: "20 кВт" }],
    [{ text: "🤔 Не знаю" }],
    [{ text: "❌ Отменить заявку" }],
  ],
  resize_keyboard: true,
};

const skipPhotoKeyboard = {
  keyboard: [
    [{ text: "⏭ Пропустить фото" }],
    [{ text: "❌ Отменить заявку" }],
  ],
  resize_keyboard: true,
};

const skipCommentKeyboard = {
  keyboard: [
    [{ text: "⏭ Без комментария" }],
    [{ text: "❌ Отменить заявку" }],
  ],
  resize_keyboard: true,
};

// ======================================================
// DATABASE HELPERS
// ======================================================

function normalizeUsername(username: string | null | undefined) {
  return String(username || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

async function getAdmin(
  telegramUserId: number,
  telegramUsername?: string | null,
) {
  // 1. Сначала ищем уже привязанного админа по Telegram ID.
  const { data: adminById, error: idError } = await supabase
    .from("admins")
    .select("*")
    .eq("telegram_user_id", telegramUserId)
    .eq("is_active", true)
    .maybeSingle();

  if (idError) {
    console.error("getAdmin by id:", idError);
  }

  if (adminById) {
    return adminById;
  }

  // 2. Если ID ещё не привязан, пробуем найти заранее разрешённый username.
  const normalized = normalizeUsername(telegramUsername);

  if (!normalized) {
    return null;
  }

  const { data: adminByUsername, error: usernameError } = await supabase
    .from("admins")
    .select("*")
    .eq("telegram_username", normalized)
    .eq("is_active", true)
    .is("telegram_user_id", null)
    .maybeSingle();

  if (usernameError) {
    console.error("getAdmin by username:", usernameError);
    return null;
  }

  if (!adminByUsername) {
    return null;
  }

  // 3. Привязываем разрешённый username к реальному Telegram ID.
  const { data: linkedAdmin, error: linkError } = await supabase
    .from("admins")
    .update({
      telegram_user_id: telegramUserId,
    })
    .eq("id", adminByUsername.id)
    .is("telegram_user_id", null)
    .select()
    .maybeSingle();

  if (linkError) {
    console.error("bind admin username:", linkError);
    return null;
  }

  return linkedAdmin;
}

async function setAdminMode(adminId: string, mode: "admin" | "client") {
  const { data, error } = await supabase
    .from("admins")
    .update({ admin_mode: mode })
    .eq("id", adminId)
    .select()
    .single();

  if (error) {
    console.error("setAdminMode:", error);
    return null;
  }

  return data;
}

async function getSession(telegramUserId: number) {
  const { data, error } = await supabase
    .from("bot_sessions")
    .select("*")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (error) console.error("getSession:", error);

  return data;
}

async function saveSession(
  telegramUserId: number,
  step: string,
  data: any,
) {
  const { error } = await supabase
    .from("bot_sessions")
    .upsert({
      telegram_user_id: telegramUserId,
      step,
      data,
      updated_at: new Date().toISOString(),
    });

  if (error) throw error;
}

async function deleteSession(telegramUserId: number) {
  const { error } = await supabase
    .from("bot_sessions")
    .delete()
    .eq("telegram_user_id", telegramUserId);

  if (error) console.error("deleteSession:", error);
}

async function getLeadWithClient(leadId: string) {
  const { data, error } = await supabase
    .from("leads")
    .select(`
      id,
      display_no,
      client_id,
      object_type,
      address,
      system_type,
      desired_power_kw,
      comment,
      status,
      visit_date,
      installation_date,
      created_at,
      updated_at,
      clients (
        telegram_user_id,
        full_name,
        phone,
        city
      )
    `)
    .eq("id", leadId)
    .maybeSingle();

  if (error) {
    console.error("getLeadWithClient:", error);
    return null;
  }

  return data;
}

function getClientFromLead(lead: any) {
  if (!lead?.clients) return null;
  return Array.isArray(lead.clients) ? lead.clients[0] : lead.clients;
}

async function notifyClientStatus(
  leadId: string,
  text: string,
) {
  const lead = await getLeadWithClient(leadId);
  const client = getClientFromLead(lead);

  if (!client?.telegram_user_id) return;

  const clientTelegramId = Number(client.telegram_user_id);
  const clientAdmin = await getAdmin(clientTelegramId);

  await sendMessage(
    clientTelegramId,
    text,
    clientAdmin ? adminClientMenu : clientMenu,
  );
}

// ======================================================
// AI ASSISTANT
// ======================================================

async function analyzeLeadWithAI(lead: any) {
  const client = getClientFromLead(lead);

  const objectType = String(lead.object_type || "").toLowerCase();
  const systemType = String(lead.system_type || "").toLowerCase();
  const rawComment = String(lead.comment || "").trim();
  const rawCity = String(client?.city || "").trim();
  const rawAddress = String(lead.address || "").trim();
  const power = Number(lead.desired_power_kw || 0);
  const status = String(lead.status || "new");

  // Простая бесплатная проверка мусора/мата без внешнего ИИ.
  // Намеренно используем корни слов, чтобы ловить разные формы написания.
  const profanityRe = /(?:\b|_)(?:хуй|хуе|хуё|хуя|хуи|пизд|ебан|ёбан|ебат|ёбат|ебл|бля|сука|сучк|мудак|долбоеб|долбоёб|гандон|залуп|шлюх)(?:\b|_)/iu;
  const repeatedCharsRe = /(.)\1{5,}/u;
  const urlRe = /https?:\/\/|www\.|t\.me\//iu;

  function looksSuspicious(value: string, kind: "city" | "address" | "comment") {
    const text = value.trim();
    if (!text) return false;
    if (profanityRe.test(text)) return true;
    if (repeatedCharsRe.test(text)) return true;
    if (urlRe.test(text)) return true;

    const letters = (text.match(/[A-Za-zА-Яа-яЁёІіЇїЄєҐґ]/gu) || []).length;
    const digits = (text.match(/\d/gu) || []).length;
    const weird = (text.match(/[^A-Za-zА-Яа-яЁёІіЇїЄєҐґ0-9\s.,'’"\-\/\\()№]/gu) || []).length;

    if (kind === "city") {
      if (text.length < 2 || text.length > 60) return true;
      if (letters < 2) return true;
      if (digits > 3) return true;
      if (weird > 2) return true;
    }

    if (kind === "address") {
      if (text.length > 160) return true;
      if (letters < 2 && digits < 1) return true;
      if (weird > 5) return true;
    }

    if (kind === "comment") {
      if (text.length > 1500) return true;
      if (weird > Math.max(8, Math.floor(text.length * 0.25))) return true;
    }

    return false;
  }

  const badCity = looksSuspicious(rawCity, "city");
  const badAddress = looksSuspicious(rawAddress, "address");
  const badComment = looksSuspicious(rawComment, "comment");

  const city = badCity ? "" : rawCity;
  const address = badAddress ? "" : rawAddress;
  const comment = badComment ? "" : rawComment;

  const suspiciousFields: string[] = [];
  if (badCity) suspiciousFields.push("город");
  if (badAddress) suspiciousFields.push("адрес");
  if (badComment) suspiciousFields.push("комментарий");

  const wantsPanels = /панел|соняч|солнеч|сес/.test(systemType);
  const wantsBattery = /аккум|батар|накоп|резерв/.test(systemType);
  const isBusiness = /бизнес|коммер|підприєм|предприят|офис|магаз|склад|сто|вироб|производ/.test(objectType);
  const isHouse = /дом|будинок|частн|коттедж|дач/.test(objectType);

  const missingImportant: string[] = [];
  if (!client?.full_name) missingImportant.push("имя");
  if (!client?.phone) missingImportant.push("телефон");
  if (!city) missingImportant.push("город");
  if (!address) missingImportant.push("адрес");
  if (!lead.object_type) missingImportant.push("тип объекта");
  if (!lead.system_type) missingImportant.push("что нужно клиенту");

  let qualityLabel = "🟢 Заявка заполнена хорошо";
  if (suspiciousFields.length > 0) {
    qualityLabel = "🔴 Есть подозрительные данные / возможный спам";
  } else if (missingImportant.length >= 3) {
    qualityLabel = "🔴 Заявка заполнена слабо";
  } else if (missingImportant.length > 0 || !power) {
    qualityLabel = "🟡 Не хватает части данных";
  }

  const summaryParts: string[] = [];
  if (isBusiness) summaryParts.push("коммерческий объект");
  else if (isHouse) summaryParts.push("частный дом");
  else summaryParts.push(lead.object_type || "объект без уточнённого типа");

  if (wantsPanels && wantsBattery) summaryParts.push("солнечные панели + аккумуляторную систему");
  else if (wantsPanels) summaryParts.push("солнечные панели");
  else if (wantsBattery) summaryParts.push("аккумуляторную/резервную систему");
  else if (lead.system_type) summaryParts.push(String(lead.system_type));
  else summaryParts.push("систему, тип которой нужно уточнить");

  if (power > 0) summaryParts.push(`ориентир по мощности — ${power} кВт`);

  const questions: string[] = [];
  const addQuestion = (q: string) => {
    if (!questions.includes(q) && questions.length < 6) questions.push(q);
  };

  if (badCity) addQuestion("Уточнить настоящий город — текущее значение выглядит некорректно.");
  if (badAddress) addQuestion("Уточнить точный адрес объекта — текущее значение выглядит некорректно.");
  if (badComment) addQuestion("Уточнить комментарий клиента — текущее значение похоже на мусор или содержит недопустимый текст.");

  addQuestion("Какое среднее потребление электроэнергии за месяц и есть ли фото/скрин последних счетов?");

  if (!power) {
    addQuestion("Какую мощность клиент хочет получить или какие основные приборы нужно обеспечить электроэнергией?");
  }

  if (wantsPanels || !systemType) {
    addQuestion("Есть ли подходящая крыша или участок под панели, какая площадь и есть ли затенение?");
    addQuestion("Какая сеть на объекте: 1 фаза или 3 фазы, и какая выделенная мощность ввода?");
  }

  if (wantsBattery || /всё|все|комплекс/.test(systemType)) {
    addQuestion("Какие приборы должны работать при отключении света и сколько часов автономности нужно?");
  }

  if (isBusiness) {
    addQuestion("Какой график работы и когда приходится основная нагрузка — днём, вечером или круглосуточно?");
  }

  if (!address && !badAddress) {
    addQuestion("Уточнить точный адрес объекта для оценки выезда и условий монтажа.");
  }

  if (!comment && !badComment) {
    addQuestion("Есть ли у клиента ограничения, пожелания по бюджету или важные особенности объекта?");
  }

  let preliminary = "Точную конфигурацию лучше определять после проверки потребления, сети и места монтажа.";
  if (power > 0 && wantsPanels && wantsBattery) {
    preliminary = `Можно предварительно рассматривать гибридную систему примерно класса ${power} кВт с солнечными панелями и аккумуляторами. Ёмкость АКБ нужно подбирать отдельно по критичным нагрузкам и желаемому времени автономии. Точный подбор — после замера и проверки потребления.`;
  } else if (power > 0 && wantsPanels) {
    preliminary = `Можно предварительно ориентироваться на солнечную станцию около ${power} кВт. Количество панелей, инвертор и схема подключения зависят от крыши/участка, фазности сети и реального потребления. Точный подбор — после замера.`;
  } else if (power > 0 && wantsBattery) {
    preliminary = `Ориентир по мощности системы — около ${power} кВт, но ёмкость аккумуляторов нельзя корректно определить только по этой цифре. Сначала нужно выяснить критичные нагрузки и требуемое время автономной работы.`;
  } else if (wantsBattery) {
    preliminary = "Для аккумуляторной системы сначала нужно определить критичные нагрузки, их суммарную мощность и желаемое время автономии; после этого подбираются инвертор и ёмкость АКБ.";
  } else if (wantsPanels) {
    preliminary = "Для солнечной станции сначала нужно сверить месячное/суточное потребление, фазность сети и доступную площадь под панели; после этого можно определить разумную мощность системы.";
  }

  const nextSteps: Record<string, string> = {
    new: "Связаться с клиентом, пройти вопросы выше и при подтверждённом интересе назначить замер.",
    contacted: "Доуточнить недостающие данные и согласовать дату замера.",
    measurement: "Провести замер: проверить место установки, сеть, ввод, щит, трассы и сделать необходимые фото.",
    measurement_done: "На основе замера подготовить конфигурацию и смету.",
    estimate_ready: "Связаться с клиентом, презентовать смету, снять возражения и согласовать монтаж.",
    installation: "Подготовить оборудование и проверить все условия перед монтажом.",
    completed: "Подтвердить завершение работ, финальный расчёт и закрывающие вопросы клиента.",
    paid: "Заявка завершена. При необходимости запланировать сервисный контакт после запуска системы.",
  };

  let nextStep = nextSteps[status] || "Уточнить недостающие данные и определить следующий этап заявки.";
  if (suspiciousFields.length > 0) {
    nextStep = `Сначала связаться с клиентом и проверить поля: ${suspiciousFields.join(", ")}. До подтверждения не использовать их для расчёта или выезда.`;
  }

  const warnings: string[] = [];
  if (suspiciousFields.length > 0) {
    warnings.push(`⚠️ Некорректные поля: ${suspiciousFields.join(", ")}. Значения скрыты из анализа.`);
  }
  if (missingImportant.length > 0) {
    warnings.push(`Не хватает: ${[...new Set(missingImportant)].join(", ")}.`);
  }

  const questionText = questions.map((q, i) => `${i + 1}. ${q}`).join("\n");

  return [
    "0. КАЧЕСТВО ЗАЯВКИ",
    qualityLabel,
    ...(warnings.length ? [warnings.join("\n")] : []),
    "",
    "1. КРАТКО",
    `Клиент ${client?.full_name || "без указанного имени"}: ${summaryParts.join(", ")}.` +
      (city ? ` Город: ${city}.` : "") +
      (address ? ` Адрес: ${address}.` : "") +
      (comment ? ` Комментарий: ${comment}` : ""),
    "",
    "2. ЧТО УТОЧНИТЬ",
    questionText || "Основные данные уже собраны; проверить их актуальность перед следующим этапом.",
    "",
    "3. ПРЕДВАРИТЕЛЬНО",
    preliminary,
    "",
    "4. СЛЕДУЮЩИЙ ШАГ",
    nextStep,
  ].join("\n");
}

// ======================================================
// LEAD DISPLAY
// ======================================================

function leadCardText(lead: any) {
  const client = getClientFromLead(lead);

  const power = lead.desired_power_kw
    ? `${lead.desired_power_kw} кВт`
    : "Не определена";

  let text =
    `☀️ <b>ЗАЯВКА №${String(lead.display_no ?? "—").padStart(4, "0")}</b>\n\n` +
    `👤 <b>Клиент:</b> ${escapeHtml(client?.full_name || "—")}\n` +
    `📞 <b>Телефон:</b> ${escapeHtml(client?.phone || "—")}\n` +
    `🏙 <b>Город:</b> ${escapeHtml(client?.city || "—")}\n` +
    `📍 <b>Адрес:</b> ${escapeHtml(lead.address || "—")}\n\n` +
    `🏠 <b>Объект:</b> ${escapeHtml(lead.object_type || "—")}\n` +
    `⚡ <b>Нужно:</b> ${escapeHtml(lead.system_type || "—")}\n` +
    `🔋 <b>Мощность:</b> ${escapeHtml(power)}\n` +
    `💬 <b>Комментарий:</b> ${escapeHtml(lead.comment || "Нет")}\n`;

  if (lead.visit_date) {
    text += `\n📅 <b>Замер:</b> ${escapeHtml(formatDateKyiv(lead.visit_date))}\n`;
  }

  if (lead.installation_date) {
    text += `\n🔧 <b>Монтаж:</b> ${escapeHtml(formatDateKyiv(lead.installation_date))}\n`;
  }

  text += `\n🆔 <b>Номер заявки:</b> №${String(lead.display_no ?? "—").padStart(4, "0")}`;

  return text;
}

function leadButtons(lead: any) {
  const rows: any[] = [];

  rows.push([
    {
      text: "🤖 Анализ заявки",
      callback_data: `ai_analysis:${lead.id}`,
    },
  ]);

  if (lead.status === "new") {
    rows.push([
      {
        text: "📞 Связались",
        callback_data: `contacted:${lead.id}`,
      },
    ]);
  }

  if (lead.status === "new" || lead.status === "contacted") {
    rows.push([
      {
        text: "📐 Назначить замер",
        callback_data: `schedule_measure:${lead.id}`,
      },
    ]);
  }

  if (lead.status === "measurement") {
    rows.push([
      {
        text: "✅ Замер выполнен",
        callback_data: `measurement_done:${lead.id}`,
      },
    ]);
  }

  if (lead.status === "measurement_done") {
    rows.push([
      {
        text: "💰 Смета готова",
        callback_data: `estimate_ready:${lead.id}`,
      },
    ]);
  }

  if (lead.status === "estimate_ready") {
    rows.push([
      {
        text: "📅 Назначить монтаж",
        callback_data: `schedule_installation:${lead.id}`,
      },
    ]);
  }

  if (lead.status === "installation") {
    rows.push([
      {
        text: "✅ Монтаж выполнен",
        callback_data: `completed:${lead.id}`,
      },
    ]);
  }

  if (lead.status === "completed") {
    rows.push([
      {
        text: "💵 Оплачено",
        callback_data: `paid:${lead.id}`,
      },
    ]);
  }

  if (
    lead.status !== "paid" &&
    lead.status !== "rejected"
  ) {
    rows.push([
      {
        text: "❌ Отказ",
        callback_data: `rejected:${lead.id}`,
      },
    ]);
  }

  return { inline_keyboard: rows };
}

async function sendLeadCard(chatId: number, lead: any) {
  await sendMessage(
    chatId,
    leadCardText(lead),
    leadButtons(lead),
  );

  const { data: photos } = await supabase
    .from("lead_photos")
    .select("telegram_file_id")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: true })
    .limit(3);

  if (photos?.length) {
    for (const photo of photos) {
      await sendPhoto(
        chatId,
        photo.telegram_file_id,
        "📸 Фото объекта",
      );
    }
  }
}

async function showLeadsByStatuses(
  chatId: number,
  statuses: string[],
  title: string,
) {
  const { data: leads, error } = await supabase
    .from("leads")
    .select(`
      id,
      display_no,
      client_id,
      object_type,
      address,
      system_type,
      desired_power_kw,
      comment,
      status,
      visit_date,
      installation_date,
      created_at,
      updated_at,
      clients (
        telegram_user_id,
        full_name,
        phone,
        city
      )
    `)
    .in("status", statuses)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("showLeadsByStatuses:", error);

    await sendMessage(
      chatId,
      "❌ Не удалось загрузить заявки.",
      adminMenu,
    );

    return;
  }

  if (!leads?.length) {
    await sendMessage(
      chatId,
      `${title}\n\nЗдесь пока пусто.`,
      adminMenu,
    );

    return;
  }

  await sendMessage(
    chatId,
    `${title}\n\nНайдено: <b>${leads.length}</b>`,
  );

  for (const lead of leads) {
    await sendLeadCard(chatId, lead);
  }
}

// ======================================================
// NEW LEAD
// ======================================================

async function notifyAdmins(
  leadId: string,
) {
  const { data: admins } = await supabase
    .from("admins")
    .select("telegram_user_id")
    .eq("is_active", true);

  if (!admins?.length) return;

  const lead = await getLeadWithClient(leadId);

  if (!lead) return;

  for (const admin of admins) {
    await sendMessage(
      Number(admin.telegram_user_id),
      "🔔 <b>Новая заявка!</b>",
    );

    await sendLeadCard(
      Number(admin.telegram_user_id),
      lead,
    );
  }
}

async function createLead(
  telegramUserId: number,
  form: any,
) {
  let { data: client, error: clientReadError } = await supabase
    .from("clients")
    .select("*")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (clientReadError) throw clientReadError;

  if (!client) {
    const { data, error } = await supabase
      .from("clients")
      .insert({
        telegram_user_id: telegramUserId,
        full_name: form.full_name,
        phone: form.phone,
        city: form.city,
      })
      .select()
      .single();

    if (error) throw error;

    client = data;
  } else {
    const { data, error } = await supabase
      .from("clients")
      .update({
        full_name: form.full_name,
        phone: form.phone,
        city: form.city,
      })
      .eq("id", client.id)
      .select()
      .single();

    if (error) throw error;

    client = data;
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      client_id: client.id,
      object_type: form.object_type,
      address: form.address,
      system_type: form.system_type,
      desired_power_kw: form.desired_power_kw,
      comment: form.comment,
      status: "new",
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (leadError) throw leadError;

  if (form.photo_file_id) {
    const { error: photoError } = await supabase
      .from("lead_photos")
      .insert({
        lead_id: lead.id,
        telegram_file_id: form.photo_file_id,
        photo_type: "client_object",
        uploaded_by: telegramUserId,
      });

    if (photoError) {
      console.error("lead photo:", photoError);
    }
  }

  await notifyAdmins(lead.id);

  return lead;
}

// ======================================================
// ADMIN CALLBACKS
// ======================================================

async function updateLeadStatus(
  leadId: string,
  status: string,
) {
  const { error } = await supabase
    .from("leads")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (error) throw error;
}

async function handleCallback(callback: any) {
  const chatId = callback.message.chat.id;
  const telegramUserId = callback.from.id;
  const data = callback.data || "";

  const admin = await getAdmin(telegramUserId, callback.from.username || null);

  if (!admin) {
    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Нет доступа",
      show_alert: true,
    });

    return;
  }

  const separatorIndex = data.indexOf(":");

  if (separatorIndex === -1) return;

  const action = data.slice(0, separatorIndex);
  const leadId = data.slice(separatorIndex + 1);

  if (!leadId) return;

  if (action === "ai_analysis") {
    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Анализирую заявку…",
    });

    const lead = await getLeadWithClient(leadId);

    if (!lead) {
      await sendMessage(chatId, "❌ Заявка не найдена.", adminMenu);
      return;
    }

    try {
      const analysis = await analyzeLeadWithAI(lead);
      const safeAnalysis = escapeHtml(analysis);

      const chunks = safeAnalysis.match(/[\s\S]{1,3500}/g) || [safeAnalysis];

      for (let i = 0; i < chunks.length; i++) {
        await sendMessage(
          chatId,
          `${i === 0 ? "🤖 <b>Умный анализ заявки</b>\n\n" : ""}${chunks[i]}`,
          i === chunks.length - 1 ? adminMenu : undefined,
        );
      }
    } catch (error) {
      console.error("AI lead analysis:", error);

      const err: any = error;
      const message = String(err?.message || err || "Ошибка ИИ");

      const safeMessage = escapeHtml(message).slice(0, 1200);
      await sendMessage(
        chatId,
        `❌ <b>Ошибка анализа</b>\n\n<code>${safeMessage}</code>`,
        adminMenu,
      );
    }

    return;
  }

  if (action === "schedule_measure") {
    await saveSession(
      telegramUserId,
      "admin_measurement_date",
      { lead_id: leadId },
    );

    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Введите дату замера",
    });

    await sendMessage(
      chatId,
      `📐 <b>Назначение замера</b>\n\n` +
        `Введите дату и время в формате:\n` +
        `<code>12.09.2026 14:30</code>\n\n` +
        `Часовой пояс: Киев.`,
      {
        keyboard: [[{ text: "❌ Отменить действие" }]],
        resize_keyboard: true,
      },
    );

    return;
  }

  if (action === "schedule_installation") {
    await saveSession(
      telegramUserId,
      "admin_installation_date",
      { lead_id: leadId },
    );

    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Введите дату монтажа",
    });

    await sendMessage(
      chatId,
      `🔧 <b>Назначение монтажа</b>\n\n` +
        `Введите дату и время в формате:\n` +
        `<code>15.09.2026 10:00</code>\n\n` +
        `Часовой пояс: Киев.`,
      {
        keyboard: [[{ text: "❌ Отменить действие" }]],
        resize_keyboard: true,
      },
    );

    return;
  }

  const actionMap: Record<string, {
    status: string;
    adminText: string;
    clientText: string;
  }> = {
    contacted: {
      status: "contacted",
      adminText: "📞 Заявка перенесена в «Связаться».",
      clientText:
        `📞 <b>SolarFlow</b>\n\nМенеджер начал работу с вашей заявкой.`,
    },

    measurement_done: {
      status: "measurement_done",
      adminText: "✅ Замер отмечен как выполненный.",
      clientText:
        `✅ <b>Замер выполнен</b>\n\nСпасибо. Менеджер готовит дальнейшее предложение.`,
    },

    estimate_ready: {
      status: "estimate_ready",
      adminText: "💰 Смета отмечена как готовая.",
      clientText:
        `💰 <b>Смета подготовлена</b>\n\nМенеджер свяжется с вами для обсуждения предложения.`,
    },

    installation: {
      status: "installation",
      adminText: "🔧 Заявка перенесена в монтажи.",
      clientText:
        `🔧 <b>Ваш объект передан в монтаж</b>\n\nМенеджер согласует с вами детали установки.`,
    },

    completed: {
      status: "completed",
      adminText: "✅ Монтаж отмечен как выполненный.",
      clientText:
        `☀️ <b>Монтаж выполнен</b>\n\nСпасибо, что выбрали SolarFlow.`,
    },

    paid: {
      status: "paid",
      adminText: "💵 Заявка отмечена как оплаченная.",
      clientText:
        `✅ <b>Оплата подтверждена</b>\n\nСпасибо за сотрудничество!`,
    },

    rejected: {
      status: "rejected",
      adminText: "❌ Заявка закрыта как отказ.",
      clientText:
        `ℹ️ <b>SolarFlow</b>\n\nРабота по этой заявке завершена. Если понадобится помощь — вы можете оставить новую заявку.`,
    },
  };

  const config = actionMap[action];

  if (!config) return;

  try {
    await updateLeadStatus(leadId, config.status);

    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Готово",
    });

    await sendMessage(
      chatId,
      config.adminText,
      adminMenu,
    );

    await notifyClientStatus(
      leadId,
      config.clientText,
    );
  } catch (error) {
    console.error("callback status update:", error);

    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Ошибка",
      show_alert: true,
    });
  }
}

// ======================================================
// ADMIN TEXT FLOW
// ======================================================

async function handleAdminSession(
  message: any,
  session: any,
) {
  const chatId = message.chat.id;
  const telegramUserId = message.from.id;
  const text = message.text?.trim() || "";

  if (text === "❌ Отменить действие") {
    await deleteSession(telegramUserId);

    await sendMessage(
      chatId,
      "Действие отменено.",
      adminMenu,
    );

    return true;
  }

  if (session.step === "admin_measurement_date") {
    const visitDate = parseVisitDate(text);

    if (!visitDate) {
      await sendMessage(
        chatId,
        `❌ Не понял дату.\n\n` +
          `Введите так:\n<code>12.09.2026 14:30</code>`,
      );

      return true;
    }

    const leadId = session.data?.lead_id;

    if (!leadId) {
      await deleteSession(telegramUserId);

      await sendMessage(
        chatId,
        "❌ Заявка не найдена.",
        adminMenu,
      );

      return true;
    }

    const { error } = await supabase
      .from("leads")
      .update({
        status: "measurement",
        visit_date: visitDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    if (error) {
      console.error("measurement date:", error);

      await sendMessage(
        chatId,
        "❌ Не удалось сохранить дату.",
        adminMenu,
      );

      return true;
    }

    await deleteSession(telegramUserId);

    const dateText = formatDateKyiv(visitDate);

    await sendMessage(
      chatId,
      `✅ <b>Замер назначен</b>\n\n📅 ${escapeHtml(dateText)}`,
      adminMenu,
    );

    await notifyClientStatus(
      leadId,
      `📐 <b>Вам назначен замер</b>\n\n` +
        `📅 ${escapeHtml(dateText)}\n\n` +
        `Если время не подходит, сообщите менеджеру.`,
    );

    return true;
  }

  if (session.step === "admin_installation_date") {
    const installationDate = parseVisitDate(text);

    if (!installationDate) {
      await sendMessage(
        chatId,
        `❌ Не понял дату.\n\n` +
          `Введите так:\n<code>15.09.2026 10:00</code>`,
      );

      return true;
    }

    const leadId = session.data?.lead_id;

    if (!leadId) {
      await deleteSession(telegramUserId);

      await sendMessage(
        chatId,
        "❌ Заявка не найдена.",
        adminMenu,
      );

      return true;
    }

    const { error } = await supabase
      .from("leads")
      .update({
        status: "installation",
        installation_date: installationDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    if (error) {
      console.error("installation date:", error);

      await sendMessage(
        chatId,
        "❌ Не удалось сохранить дату монтажа.",
        adminMenu,
      );

      return true;
    }

    await deleteSession(telegramUserId);

    const dateText = formatDateKyiv(installationDate);

    await sendMessage(
      chatId,
      `✅ <b>Монтаж назначен</b>\n\n🔧 ${escapeHtml(dateText)}`,
      adminMenu,
    );

    await notifyClientStatus(
      leadId,
      `🔧 <b>Вам назначен монтаж</b>\n\n` +
        `📅 ${escapeHtml(dateText)}\n\n` +
        `Если время не подходит, сообщите менеджеру.`,
    );

    return true;
  }

  return false;
}

// ======================================================
// CLIENT FORM
// ======================================================

async function handleClientSession(
  message: any,
  session: any,
) {
  const chatId = message.chat.id;
  const telegramUserId = message.from.id;
  const text = message.text?.trim() || "";
  const form = session.data || {};

  if (text === "❌ Отменить заявку") {
    await deleteSession(telegramUserId);

    await sendMessage(
      chatId,
      "Заявка отменена.",
      clientMenu,
    );

    return true;
  }

  if (session.step === "name") {
    if (!text) {
      await sendMessage(chatId, "Напишите ваше имя текстом.");
      return true;
    }

    form.full_name = text;

    await saveSession(telegramUserId, "phone", form);

    await sendMessage(
      chatId,
      `📞 <b>Укажите номер телефона</b>\n\n` +
        `Нажмите <b>«📲 Поделиться номером Telegram»</b>, чтобы отправить номер, привязанный к вашему Telegram.\n\n` +
        `Если для связи нужен другой номер — нажмите <b>«✍️ Ввести другой номер»</b>.`,
      phoneKeyboard,
    );

    return true;
  }

  if (session.step === "phone") {
    if (message.contact?.phone_number) {
      if (message.contact.user_id && message.contact.user_id !== telegramUserId) {
        await sendMessage(
          chatId,
          `⚠️ Пожалуйста, поделитесь именно своим номером Telegram или нажмите <b>«✍️ Ввести другой номер»</b>.`,
          phoneKeyboard,
        );
        return true;
      }

      let contactPhone = String(message.contact.phone_number).replace(/[^\d+]/g, "");
      if (contactPhone.startsWith("380") && !contactPhone.startsWith("+")) {
        contactPhone = `+${contactPhone}`;
      }

      if (!/^\+380\d{9}$/.test(contactPhone)) {
        await sendMessage(
          chatId,
          `⚠️ Номер Telegram имеет другой формат.\n\nНажмите <b>«✍️ Ввести другой номер»</b> и укажите номер вручную.`,
          phoneKeyboard,
        );
        return true;
      }

      form.phone = contactPhone;
      await saveSession(telegramUserId, "city", form);

      await sendMessage(
        chatId,
        `✅ Номер получен: <code>${escapeHtml(contactPhone)}</code>\n\n🏙 <b>В каком городе находится объект?</b>`,
        cancelKeyboard,
      );
      return true;
    }

    if (text === "✍️ Ввести другой номер") {
      await saveSession(telegramUserId, "phone_manual", form);
      await sendMessage(
        chatId,
        `📞 <b>Введите номер телефона вручную</b>\n\n` +
          `Можно без +380. Например:\n<code>0671234567</code>`,
        cancelKeyboard,
      );
      return true;
    }

    await sendMessage(
      chatId,
      `Выберите один из вариантов ниже:\n\n` +
        `📲 поделиться номером Telegram\n` +
        `или\n` +
        `✍️ ввести другой номер вручную.`,
      phoneKeyboard,
    );
    return true;
  }

  if (session.step === "phone_manual") {
    let cleaned = text.replace(/\D/g, "");

    // Можно вводить: 0671234567, 671234567, 380671234567 или +380671234567
    if (/^0\d{9}$/.test(cleaned)) {
      cleaned = `+38${cleaned}`;
    } else if (/^\d{9}$/.test(cleaned)) {
      cleaned = `+380${cleaned}`;
    } else if (/^380\d{9}$/.test(cleaned)) {
      cleaned = `+${cleaned}`;
    }

    if (!/^\+380\d{9}$/.test(cleaned)) {
      await sendMessage(
        chatId,
        `❌ Неверный номер.\n\n` +
          `Можно просто ввести:\n<code>0671234567</code>\n\nТакже подойдут 671234567 или +380671234567.`,
        cancelKeyboard,
      );

      return true;
    }

    form.phone = cleaned;

    await saveSession(telegramUserId, "city", form);

    await sendMessage(
      chatId,
      `✅ Номер сохранён: <code>${escapeHtml(cleaned)}</code>\n\n🏙 <b>В каком городе находится объект?</b>`,
      cancelKeyboard,
    );

    return true;
  }

  if (session.step === "city") {
    if (!text) return true;

    const normalizedCity = text.trim().toLowerCase().replace(/ё/g, "е");
    if (["самар", "samar"].includes(normalizedCity)) {
      form.city_candidate = "Самар, Днепропетровская область";
      await saveSession(telegramUserId, "city_confirm", form);
      await sendMessage(
        chatId,
        `🏙 Вы имели в виду <b>Самар, Днепропетровская область</b>?`,
        { keyboard: [[{ text: "✅ Да" }, { text: "✏️ Нет, ввести другой город" }], [{ text: "❌ Отменить заявку" }]], resize_keyboard: true },
      );
      return true;
    }

    form.city = text.trim();
    await saveSession(telegramUserId, "address", form);
    await sendMessage(chatId, `📍 <b>Введите улицу и номер дома</b>\n\nНапример: ул. Центральная 15`, cancelKeyboard);
    return true;
  }

  if (session.step === "city_confirm") {
    if (text === "✅ Да") {
      form.city = form.city_candidate || "Самар, Днепропетровская область";
      delete form.city_candidate;
      await saveSession(telegramUserId, "address", form);
      await sendMessage(chatId, `📍 <b>Введите улицу и номер дома</b>\n\nНапример: ул. Центральная 15`, cancelKeyboard);
      return true;
    }
    if (text === "✏️ Нет, ввести другой город") {
      delete form.city_candidate;
      await saveSession(telegramUserId, "city", form);
      await sendMessage(chatId, `🏙 <b>Введите город ещё раз</b>`, cancelKeyboard);
      return true;
    }
    await sendMessage(chatId, `Выберите «✅ Да» или «✏️ Нет, ввести другой город».`);
    return true;
  }

  if (session.step === "address") {
    if (!text) return true;

    form.address = text;

    await saveSession(telegramUserId, "object_type", form);

    await sendMessage(
      chatId,
      `🏠 <b>Какой это объект?</b>`,
      objectTypeKeyboard,
    );

    return true;
  }

  if (session.step === "object_type") {
    const allowed = [
      "🏠 Частный дом",
      "🏢 Бизнес / предприятие",
      "🏭 Другой объект",
    ];

    if (!allowed.includes(text)) {
      await sendMessage(
        chatId,
        "Выберите тип объекта кнопкой.",
        objectTypeKeyboard,
      );

      return true;
    }

    form.object_type = text;

    await saveSession(telegramUserId, "system_type", form);

    await sendMessage(
      chatId,
      `⚡ <b>Что вас интересует?</b>`,
      systemTypeKeyboard,
    );

    return true;
  }

  if (session.step === "system_type") {
    const allowed = [
      "☀️ Солнечная станция под ключ",
      "🔆 Солнечные панели",
      "⚡ Инвертор",
      "🔋 Аккумулятор",
      "⚡ Инвертор + аккумулятор",
    ];

    if (!allowed.includes(text)) {
      await sendMessage(
        chatId,
        "Выберите вариант кнопкой.",
        systemTypeKeyboard,
      );

      return true;
    }

    form.system_type = text;

    await saveSession(telegramUserId, "power", form);

    await sendMessage(
      chatId,
      `🔋 <b>Какая мощность вас интересует?</b>`,
      powerKeyboard,
    );

    return true;
  }

  if (session.step === "power") {
    if (text === "🤔 Не знаю") {
      form.desired_power_kw = null;
    } else {
      const match = text.match(/(\d+(?:[.,]\d+)?)/);

      if (!match) {
        await sendMessage(
          chatId,
          "Выберите мощность кнопкой.",
          powerKeyboard,
        );

        return true;
      }

      form.desired_power_kw = Number(
        match[1].replace(",", "."),
      );
    }

    await saveSession(telegramUserId, "photo", form);

    await sendMessage(
      chatId,
      `📸 <b>Отправьте фото объекта</b>\n\n` +
        `Можно отправить фото крыши, места установки или электрощитовой.\n\n` +
        `Если фото сейчас нет — нажмите «Пропустить фото».`,
      skipPhotoKeyboard,
    );

    return true;
  }

  if (session.step === "photo") {
    if (message.photo?.length) {
      const photo = message.photo[message.photo.length - 1];
      form.photo_file_id = photo.file_id;
    } else if (text !== "⏭ Пропустить фото") {
      await sendMessage(
        chatId,
        `📸 Отправьте фотографию или нажмите «Пропустить фото».`,
        skipPhotoKeyboard,
      );

      return true;
    }

    await saveSession(telegramUserId, "comment", form);

    await sendMessage(
      chatId,
      `💬 <b>Есть дополнительные пожелания?</b>\n\n` +
        `Например:\n` +
        `• нужен резерв при отключениях\n` +
        `• интересует продажа электроэнергии\n` +
        `• нужен монтаж под ключ`,
      skipCommentKeyboard,
    );

    return true;
  }

  if (session.step === "comment") {
    form.comment = text === "⏭ Без комментария" ? "" : text;

    await saveSession(telegramUserId, "confirm", form);

    const power = form.desired_power_kw
      ? `${form.desired_power_kw} кВт`
      : "Не знаю";

    await sendMessage(
      chatId,
      `☀️ <b>Проверьте заявку</b>\n\n` +
        `👤 <b>Имя:</b> ${escapeHtml(form.full_name)}\n` +
        `📞 <b>Телефон:</b> ${escapeHtml(form.phone)}\n` +
        `🏙 <b>Город:</b> ${escapeHtml(form.city)}\n` +
        `📍 <b>Адрес:</b> ${escapeHtml(form.address)}\n\n` +
        `🏠 <b>Объект:</b> ${escapeHtml(form.object_type)}\n` +
        `⚡ <b>Нужно:</b> ${escapeHtml(form.system_type)}\n` +
        `🔋 <b>Мощность:</b> ${escapeHtml(power)}\n` +
        `💬 <b>Комментарий:</b> ${escapeHtml(form.comment || "Нет")}\n\n` +
        `Всё верно?`,
      {
        keyboard: [
          [{ text: "✅ Отправить заявку" }],
          [{ text: "❌ Отменить заявку" }],
        ],
        resize_keyboard: true,
      },
    );

    return true;
  }

  if (
    session.step === "confirm" &&
    text === "✅ Отправить заявку"
  ) {
    try {
      await createLead(telegramUserId, form);

      await deleteSession(telegramUserId);

      await sendMessage(
        chatId,
        `✅ <b>Заявка успешно отправлена!</b>\n\n` +
          `Спасибо, ${escapeHtml(form.full_name)}.\n` +
          `Менеджер получил вашу заявку и свяжется с вами.`,
        clientMenu,
      );
    } catch (error) {
      console.error("CREATE LEAD ERROR:", error);

      await sendMessage(
        chatId,
        `❌ Не удалось сохранить заявку.\nПопробуйте ещё раз.`,
        clientMenu,
      );
    }

    return true;
  }

  return false;
}

// ======================================================
// TODAY TASKS
// ======================================================

async function showTodayTasks(chatId: number) {
  const today = kyivDateKey(new Date());

  const { data: leads, error } = await supabase
    .from("leads")
    .select(`
      id,
      status,
      address,
      visit_date,
      installation_date,
      clients (
        full_name,
        phone,
        city
      )
    `)
    .or("visit_date.not.is.null,installation_date.not.is.null")
    .order("visit_date", { ascending: true, nullsFirst: false })
    .limit(100);

  if (error) {
    console.error("showTodayTasks:", error);

    await sendMessage(
      chatId,
      "❌ Не удалось загрузить задачи.",
      adminMenu,
    );
    return;
  }

  const tasks: any[] = [];

  for (const lead of leads || []) {
    const client = getClientFromLead(lead);

    if (
      lead.visit_date &&
      kyivDateKey(lead.visit_date) === today &&
      lead.status === "measurement"
    ) {
      tasks.push({
        time: new Date(lead.visit_date).getTime(),
        text:
          `📐 <b>ЗАМЕР</b>\n` +
          `🕒 ${escapeHtml(formatDateKyiv(lead.visit_date))}\n` +
          `👤 ${escapeHtml(client?.full_name || "—")}\n` +
          `📞 ${escapeHtml(client?.phone || "—")}\n` +
          `📍 ${escapeHtml(lead.address || client?.city || "—")}`,
      });
    }

    if (
      lead.installation_date &&
      kyivDateKey(lead.installation_date) === today &&
      lead.status === "installation"
    ) {
      tasks.push({
        time: new Date(lead.installation_date).getTime(),
        text:
          `🔧 <b>МОНТАЖ</b>\n` +
          `🕒 ${escapeHtml(formatDateKyiv(lead.installation_date))}\n` +
          `👤 ${escapeHtml(client?.full_name || "—")}\n` +
          `📞 ${escapeHtml(client?.phone || "—")}\n` +
          `📍 ${escapeHtml(lead.address || client?.city || "—")}`,
      });
    }
  }

  tasks.sort((a, b) => a.time - b.time);

  if (!tasks.length) {
    await sendMessage(
      chatId,
      `📅 <b>Мои задачи на сегодня</b>\n\n` +
        `На сегодня замеров и монтажей нет.`,
      adminMenu,
    );
    return;
  }

  await sendMessage(
    chatId,
    `📅 <b>Мои задачи на сегодня</b>\n\n` +
      `Всего задач: <b>${tasks.length}</b>`,
  );

  for (const task of tasks) {
    await sendMessage(chatId, task.text);
  }

  await sendMessage(
    chatId,
    "Выберите следующий раздел.",
    adminMenu,
  );
}

// ======================================================
// STATISTICS
// ======================================================

async function countStatus(status: string) {
  const { count } = await supabase
    .from("leads")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("status", status);

  return count || 0;
}

async function showStatistics(chatId: number) {
  const [
    totalResult,
    newCount,
    contactedCount,
    measurementCount,
    installationCount,
    completedCount,
    paidCount,
  ] = await Promise.all([
    supabase.from("leads").select("*", {
      count: "exact",
      head: true,
    }),
    countStatus("new"),
    countStatus("contacted"),
    countStatus("measurement"),
    countStatus("installation"),
    countStatus("completed"),
    countStatus("paid"),
  ]);

  await sendMessage(
    chatId,
    `📊 <b>Статистика SolarFlow</b>\n\n` +
      `📋 Всего заявок: <b>${totalResult.count || 0}</b>\n` +
      `🆕 Новые: <b>${newCount}</b>\n` +
      `📞 Связаться: <b>${contactedCount}</b>\n` +
      `📐 Замеры: <b>${measurementCount}</b>\n` +
      `🔧 Монтажи: <b>${installationCount}</b>\n` +
      `✅ Выполнено: <b>${completedCount}</b>\n` +
      `💵 Оплачено: <b>${paidCount}</b>`,
    adminMenu,
  );
}


// ======================================================
// TELEGRAM MINI APP API
// ======================================================

const MINIAPP_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type,x-telegram-init-data,x-solarflow-session",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...MINIAPP_CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(key: Uint8Array, message: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message)),
  );
}

async function validateTelegramInitData(initData: string) {
  if (!initData) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = await hmacSha256(
    new TextEncoder().encode("WebAppData"),
    TELEGRAM_BOT_TOKEN,
  );
  const calculatedHash = bytesToHex(await hmacSha256(secretKey, dataCheckString));

  if (calculatedHash !== hash.toLowerCase()) return null;

  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || Math.abs(Date.now() / 1000 - authDate) > 86400) return null;

  try {
    const user = JSON.parse(params.get("user") || "{}");
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

function miniStatusLabel(status: string) {
  const labels: Record<string, string> = {
    new: "Новая",
    contacted: "Связались",
    measurement: "Замер",
    measurement_done: "Замер выполнен",
    estimate_ready: "Смета готова",
    installation: "Монтаж",
    completed: "Монтаж завершён",
    paid: "Оплачено",
    rejected: "Отказ",
  };
  return labels[status] || status || "—";
}


const SOLARFLOW_APP_PIN = Deno.env.get("SOLARFLOW_APP_PIN") || "";
const OWNER_SESSION_DAYS = 30;

function base64UrlEncode(text: string) {
  return btoa(unescape(encodeURIComponent(text)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(text: string) {
  const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - normalized.length % 4) % 4);
  return decodeURIComponent(escape(atob(normalized + pad)));
}

async function ownerSignature(payload: string) {
  if (!SOLARFLOW_APP_PIN) return "";
  return bytesToHex(await hmacSha256(
    new TextEncoder().encode(SOLARFLOW_APP_PIN),
    payload,
  ));
}

async function createOwnerSession() {
  const payload = base64UrlEncode(JSON.stringify({
    exp: Date.now() + OWNER_SESSION_DAYS * 24 * 60 * 60 * 1000,
    role: "owner",
  }));
  const sig = await ownerSignature(payload);
  return `${payload}.${sig}`;
}

async function validateOwnerSession(token: string) {
  if (!token || !SOLARFLOW_APP_PIN) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expected = await ownerSignature(payload);
  if (!expected || expected !== sig) return false;
  try {
    const data = JSON.parse(base64UrlDecode(payload));
    return data?.role === "owner" && Number(data?.exp) > Date.now();
  } catch {
    return false;
  }
}

async function requireOwnerApp(req: Request) {
  const token = req.headers.get("x-solarflow-session") || "";
  if (!(await validateOwnerSession(token))) return { error: "PIN authorization required" };

  const { data: admin } = await supabase
    .from("admins")
    .select("id,telegram_user_id,full_name,is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return { admin: admin || null };
}

async function requireMiniAppAdmin(req: Request) {
  const initData = req.headers.get("x-telegram-init-data") || "";
  const tgUser = await validateTelegramInitData(initData);
  if (!tgUser) return { error: "Telegram authorization failed" };

  const { data: admin, error } = await supabase
    .from("admins")
    .select("id,telegram_user_id,full_name,is_active")
    .eq("telegram_user_id", Number(tgUser.id))
    .eq("is_active", true)
    .maybeSingle();

  if (error || !admin) return { error: "Access denied" };
  return { admin, tgUser };
}

async function handleMiniAppRequest(req: Request, url: URL) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: MINIAPP_CORS });

  if (req.method === "POST") {
    let loginBody: any = {};
    try { loginBody = await req.clone().json(); } catch {}
    if (loginBody.action === "login") {
      if (!SOLARFLOW_APP_PIN) {
        return jsonResponse({ ok: false, error: "SOLARFLOW_APP_PIN is not configured" }, 500);
      }
      const pin = String(loginBody.pin || "").trim();
      if (!pin || pin !== SOLARFLOW_APP_PIN) {
        return jsonResponse({ ok: false, error: "Неверный PIN-код" }, 401);
      }
      return jsonResponse({ ok: true, session: await createOwnerSession() });
    }
  }

  const auth: any = await requireOwnerApp(req);
  if (auth.error) return jsonResponse({ ok: false, error: auth.error }, 401);

  if (req.method === "GET") {
    const { data: leads, error } = await supabase
      .from("leads")
      .select(`
        id,request_number,status,object_type,address,system_type,desired_power_kw,comment,
        visit_date,installation_date,created_at,updated_at,
        clients ( telegram_user_id,full_name,phone,city )
      `)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return jsonResponse({ ok: false, error: error.message }, 500);

    const items = (leads || []).map((lead: any) => {
      const client = Array.isArray(lead.clients) ? lead.clients[0] : lead.clients;
      return {
        id: lead.id,
        request_number: lead.request_number || null,
        status: lead.status,
        status_label: miniStatusLabel(lead.status),
        object_type: lead.object_type,
        address: lead.address,
        system_type: lead.system_type,
        desired_power_kw: lead.desired_power_kw,
        comment: lead.comment,
        visit_date: lead.visit_date,
        installation_date: lead.installation_date,
        created_at: lead.created_at,
        client: {
          telegram_user_id: client?.telegram_user_id || null,
          full_name: client?.full_name || "Без имени",
          phone: client?.phone || "",
          city: client?.city || "",
        },
      };
    });

    const stats = {
      total: items.length,
      new: items.filter((x: any) => x.status === "new").length,
      measurement: items.filter((x: any) =>
        ["measurement", "measurement_done"].includes(x.status)
      ).length,
      installation: items.filter((x: any) => x.status === "installation").length,
      paid: items.filter((x: any) => x.status === "paid").length,
    };

    return jsonResponse({
      ok: true,
      admin: {
        name: auth.admin?.full_name || "Администратор",
        telegram_id: auth.admin?.telegram_user_id || null,
      },
      stats,
      leads: items,
    });
  }

  if (req.method === "POST") {
    let body: any = {};
    try { body = await req.json(); } catch {}

    if (body.action === "update_status") {
      const allowed = new Set([
        "new","contacted","measurement","measurement_done",
        "estimate_ready","installation","completed","paid","rejected",
      ]);
      if (!body.lead_id || !allowed.has(body.status)) {
        return jsonResponse({ ok: false, error: "Invalid status request" }, 400);
      }

      const { error } = await supabase
        .from("leads")
        .update({ status: body.status, updated_at: new Date().toISOString() })
        .eq("id", body.lead_id);

      if (error) return jsonResponse({ ok: false, error: error.message }, 500);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ ok: false, error: "Unknown action" }, 400);
  }

  return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
}


// ======================================================
// MAIN
// ======================================================

serve(async (req) => {
  try {
    const url = new URL(req.url);
    if (url.searchParams.has("miniapp")) {
      return await handleMiniAppRequest(req, url);
    }

    const update = await req.json();

    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return new Response("ok");
    }

    const message = update.message;

    if (!message) {
      return new Response("ok");
    }

    const chatId = message.chat.id;
    const telegramUserId = message.from.id;
    const text = message.text?.trim() || "";

    if (text === "/client" || text.toLowerCase() === "клиент") {
      const admin = await getAdmin(
        telegramUserId,
        message.from.username || null,
      );

      if (!admin) {
        await sendMessage(
          chatId,
          "❌ Эта команда доступна только администраторам.",
        );
        return new Response("ok");
      }

      await deleteSession(telegramUserId);

      const updatedAdmin = await setAdminMode(admin.id, "client");

      if (!updatedAdmin) {
        await sendMessage(
          chatId,
          "❌ Не удалось открыть панель клиента.",
        );
        return new Response("ok");
      }

      await sendMessage(
        chatId,
        `👤 <b>Панель клиента</b>\n\n` +
          `Вы можете проверить бот как обычный клиент.\n` +
          `Чтобы вернуться — нажмите «⚙️ Админ-панель» или отправьте /admin.`,
        adminClientMenu,
      );

      return new Response("ok");
    }

    if (text === "/admin" || text.toLowerCase() === "админ") {
      const admin = await getAdmin(
        telegramUserId,
        message.from.username || null,
      );

      if (!admin) {
        await sendMessage(
          chatId,
          "❌ У вас нет доступа к админ-панели.",
        );
        return new Response("ok");
      }

      await deleteSession(telegramUserId);

      const updatedAdmin = await setAdminMode(admin.id, "admin");

      if (!updatedAdmin) {
        await sendMessage(
          chatId,
          "❌ Не удалось открыть админ-панель.",
        );
        return new Response("ok");
      }

      await sendMessage(
        chatId,
        `⚙️ <b>Админ-панель SolarFlow</b>\n\n` +
          `Выберите нужный раздел.`,
        adminMenu,
      );

      return new Response("ok");
    }

    if (text === "/start") {
      await deleteSession(telegramUserId);

      const admin = await getAdmin(
        telegramUserId,
        message.from.username || null,
      );

      if (admin) {
        const mode = admin.admin_mode === "client" ? "client" : "admin";

        if (mode === "client") {
          await sendMessage(
            chatId,
            `☀️ <b>SolarFlow</b>\n\n` +
              `Вы сейчас в режиме клиента.\n` +
              `Чтобы вернуться — нажмите «⚙️ Админ-панель».`,
            adminClientMenu,
          );
        } else {
          await sendMessage(
            chatId,
            `⚙️ <b>Админ-панель SolarFlow</b>\n\n` +
              `Управление заявками, замерами и монтажами.`,
            adminMenu,
          );
        }
      } else {
        await sendMessage(
          chatId,
          `☀️ <b>SolarFlow</b>\n\n` +
            `Подберём солнечную систему для вашего объекта.\n\n` +
            `Оставьте заявку — менеджер свяжется с вами.`,
          clientMenu,
        );
      }

      return new Response("ok");
    }

    const admin = await getAdmin(
      telegramUserId,
      message.from.username || null,
    );
    const session = await getSession(telegramUserId);

    if (admin && text === "⚙️ Админ-панель") {
      await deleteSession(telegramUserId);
      const updatedAdmin = await setAdminMode(admin.id, "admin");

      if (!updatedAdmin) {
        await sendMessage(chatId, "❌ Не удалось открыть админ-панель.");
        return new Response("ok");
      }

      await sendMessage(
        chatId,
        `⚙️ <b>Админ-панель SolarFlow</b>\n\n` +
          `Выберите нужный раздел.`,
        adminMenu,
      );

      return new Response("ok");
    }

    if (admin && text === "👤 Панель клиента") {
      await deleteSession(telegramUserId);
      const updatedAdmin = await setAdminMode(admin.id, "client");

      if (!updatedAdmin) {
        await sendMessage(chatId, "❌ Не удалось переключить режим.");
        return new Response("ok");
      }

      await sendMessage(
        chatId,
        `👤 <b>Панель клиента</b>\n\n` +
          `Теперь можно проверить обычный путь клиента.\n` +
          `Чтобы вернуться — нажмите «⚙️ Админ-панель».`,
        adminClientMenu,
      );

      return new Response("ok");
    }

    const adminInClientMode = admin?.admin_mode === "client";

    // Важно: сначала продолжаем активное действие админа.
    if (admin && !adminInClientMode && session) {
      const handled = await handleAdminSession(message, session);

      if (handled) {
        return new Response("ok");
      }
    }

    if (admin && !adminInClientMode) {
      if (text === "📅 Мои задачи") {
        await showTodayTasks(chatId);
        return new Response("ok");
      }

      if (text === "🆕 Новые заявки") {
        await showLeadsByStatuses(
          chatId,
          ["new"],
          "🆕 <b>Новые заявки</b>",
        );

        return new Response("ok");
      }

      if (text === "📞 Связаться") {
        await showLeadsByStatuses(
          chatId,
          ["contacted"],
          "📞 <b>Нужно связаться</b>",
        );

        return new Response("ok");
      }

      if (text === "📐 Замеры") {
        await showLeadsByStatuses(
          chatId,
          ["measurement", "measurement_done", "estimate_ready"],
          "📐 <b>Замеры и сметы</b>",
        );

        return new Response("ok");
      }

      if (text === "🔧 Монтажи") {
        await showLeadsByStatuses(
          chatId,
          ["installation", "completed"],
          "🔧 <b>Монтажи</b>",
        );

        return new Response("ok");
      }

      if (text === "👷 Монтажники") {
        const { data: workers, error } = await supabase
          .from("workers")
          .select("*")
          .eq("is_active", true)
          .order("full_name");

        if (error) {
          await sendMessage(
            chatId,
            "❌ Не удалось загрузить монтажников.",
            adminMenu,
          );

          return new Response("ok");
        }

        if (!workers?.length) {
          await sendMessage(
            chatId,
            `👷 <b>Монтажники</b>\n\n` +
              `Монтажников пока нет.\n\n` +
              `Следующим шагом добавим их через админ-панель.`,
            adminMenu,
          );

          return new Response("ok");
        }

        const textWorkers = workers
          .map((w: any, i: number) =>
            `${i + 1}. <b>${escapeHtml(w.full_name)}</b>` +
            `${w.phone ? `\n📞 ${escapeHtml(w.phone)}` : ""}`
          )
          .join("\n\n");

        await sendMessage(
          chatId,
          `👷 <b>Монтажники</b>\n\n${textWorkers}`,
          adminMenu,
        );

        return new Response("ok");
      }

      if (text === "📊 Статистика") {
        await showStatistics(chatId);
        return new Response("ok");
      }

      await sendMessage(
        chatId,
        "Выберите раздел в меню.",
        adminMenu,
      );

      return new Response("ok");
    }

    // CLIENT

    if (text === "☀️ Оставить заявку") {
      await saveSession(
        telegramUserId,
        "name",
        {},
      );

      await sendMessage(
        chatId,
        `👤 <b>Как вас зовут?</b>\n\nНапишите ваше имя.`,
        cancelKeyboard,
      );

      return new Response("ok");
    }

    if (text === "📞 Связаться с менеджером") {
      await sendMessage(
        chatId,
        `📞 <b>Связаться с менеджером</b>\n\nНажмите кнопку ниже, чтобы написать менеджеру напрямую.`,
        { inline_keyboard: [[{ text: "💬 Написать менеджеру", url: "https://t.me/Artem_Zenikov" }]] },
      );

      return new Response("ok");
    }

    if (session) {
      const handled = await handleClientSession(message, session);

      if (handled) {
        return new Response("ok");
      }
    }

    await sendMessage(
      chatId,
      "Выберите действие в меню.",
      admin ? adminClientMenu : clientMenu,
    );

    return new Response("ok");
  } catch (error) {
    console.error("MAIN ERROR:", error);
    return new Response("ok");
  }
});