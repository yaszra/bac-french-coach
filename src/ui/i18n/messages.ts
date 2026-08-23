/**
 * Bilingual message catalogue.
 *
 * English and Arabic are built together, not English-then-translated. The
 * type below makes a missing Arabic string a compile error, so a release
 * cannot ship a half-translated screen.
 *
 * IMPORTANT: the Arabic here is UI copy, hand-written and pending review by
 * a qualified Arabic linguist before release (see docs/04). It is never
 * Qur'anic text — the tripwire in src/content/tripwire.ts allows Arabic
 * script in this directory only because these are interface strings, and
 * the corpus never passes through here.
 */

export type Locale = "en" | "ar";

export const LOCALES: readonly Locale[] = ["en", "ar"];

/** Arabic is right-to-left; layout mirrors, the muṣḥaf never does. */
export function directionOf(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

const en = {
  "app.name": "ATHAR",
  "app.tagline": "Memory made visible.",

  "nav.today": "Today",
  "nav.memorize": "Memorize",
  "nav.review": "Review",
  "nav.reading": "Reading",
  "nav.progress": "Progress",
  "nav.account": "Account",

  "today.heading": "Today",
  "today.continueNow": "Continue now",
  "today.newMemory": "New memory",
  "today.keepStrong": "Keep strong",
  "today.teacherResponse": "Teacher response",
  "today.optionalPractice": "Optional practice",
  "today.effortTarget": "Today's effort target",
  "today.activeMinutes": "{minutes} minutes of active practice",
  "today.nothingDue": "Nothing is due today. This is a quiet day, not a missed one.",
  "today.start": "Start",
  "today.continue": "Continue",
  "today.review": "Review",

  "session.stage": "Stage {current} of {total}",
  "session.stage.orient": "Orient",
  "session.stage.listen": "Listen and map",
  "session.stage.reconstruct": "Reconstruct",
  "session.stage.withdraw": "Withdraw cues",
  "session.stage.prove": "Prove independent recall",
  "session.stage.connect": "Connect",
  "session.stage.recite": "Recite blind",
  "session.stage.verify": "Human verification",
  "session.stage.retain": "Retain and repair",

  "session.listenCount": "Listens: {done} of {required}",
  "session.play": "Play āyah",
  "session.pause": "Pause",
  "session.speed": "Playback speed",
  "session.needHint": "Need a hint",
  "session.hintConsequence":
    "Using a hint records this attempt as practice, not independent recall.",
  "session.blankPage": "The page begins blank. Words appear as you recall them.",
  "session.tileTray": "Word tiles",
  "session.tileTrayHelp":
    "Choose the next word. Use arrow keys to move between tiles and Enter to place one.",
  "session.placedWord": "Word {position} placed",
  "session.readyToVerify": "Ready for your teacher",

  "scaffold.full_tiles": "All words shown",
  "scaffold.fewer_tiles_with_anchors": "Fewer words, anchors kept",
  "scaffold.gap_fill": "Fill the gaps",
  "scaffold.first_letter_cue": "First letters only",
  "scaffold.no_answer_choices": "No choices shown",
  "scaffold.oral_blank_page": "Recite from a blank page",
  "scaffold.advanced": "Some support removed.",
  "scaffold.retreated": "More support added.",
  "scaffold.held": "Support unchanged.",

  "state.assigned": "Assigned",
  "state.preparing": "Preparing",
  "state.recalled_independently": "Recalled independently",
  "state.ready_for_verification": "Ready for verification",
  "state.verified": "Verified",
  "state.established": "Established",
  "state.durable": "Durable",
  "state.fragile": "Needs strengthening",
  "state.repairing": "Repairing",

  "evidence.independent": "On your own",
  "evidence.assisted": "With help",
  "evidence.scaffolded": "With the words shown",
  "evidence.ofTotal": "{count} of {total}",
  "evidence.notRecorded": "Not recorded",
  "evidence.notReviewed": "Not reviewed",
  "evidence.insufficient": "Not enough evidence yet",
  "evidence.engineUnavailable":
    "The scheduler is unavailable, so no review times are shown.",

  "teach.attention": "Attention",
  "teach.awaiting_verification": "Waiting for verification",
  "teach.repeated_corrections": "Repeated corrections",
  "teach.recall_decline": "Recall has slipped",
  "teach.not_started": "Assigned, not started",
  "teach.review_overload": "Review overload",
  "teach.inactivity": "Quiet learners",
  "teach.governance_request": "Governance requests",
  "teach.recently_improved": "Recently improved",
  "teach.confidence": "Confidence: {level}",
  "teach.confidence.high": "high",
  "teach.confidence.medium": "medium",
  "teach.confidence.low": "low",
  "teach.evidence": "Evidence",
  "teach.emptyInbox": "Nothing needs your attention right now.",

  "verify.heading": "Verification",
  "verify.expectedPassage": "Expected passage",
  "verify.priorCorrections": "Prior corrections",
  "verify.cueHistory": "Cue history",
  "verify.advisorySignal": "Advisory signal",
  "verify.advisoryCaveat":
    "Speech recognition is advisory only. It cannot certify recitation.",
  "verify.decision": "Decision",
  "verify.verified_cleanly": "Verified cleanly",
  "verify.verified_minor_slip": "Verified with a minor slip",
  "verify.practice_again": "Practice again",
  "verify.unable_to_assess": "Unable to assess",
  "verify.addCorrection": "Add a correction",
  "verify.note": "Note",
  "verify.saveAndNext": "Save and next learner",

  "family.heading": "My child",
  "family.thisWeek": "This week",
  "family.teacherAsked": "What the teacher asked for",
  "family.homeTasks": "Home tasks",
  "family.assignedBy": "Assigned by {name}",
  "family.checkedBy": "Checked by {name} on {date}",
  "family.noPractice": "No recorded practice on {date}.",
  "family.lastVerification": "Last teacher verification: {date} — {decision}",

  "state.loading": "Loading",
  "state.empty": "Nothing here yet",
  "state.stale": "Last updated {minutes} minutes ago",
  "state.denied": "You do not have access to this.",
  "state.deniedHelp": "An academy administrator can grant access.",
  "state.offline": "You are offline. Your work is saved and will sync.",
  "state.error": "Something went wrong.",
  "state.retry": "Try again",
} as const;

export type MessageKey = keyof typeof en;

/**
 * Arabic UI copy. Typed as a complete record of `MessageKey`, so omitting
 * one fails the build rather than falling back silently to English.
 */
const ar: Record<MessageKey, string> = {
  "app.name": "أَثَر",
  "app.tagline": "الذاكرة تصبح مرئية.",

  "nav.today": "اليوم",
  "nav.memorize": "الحفظ",
  "nav.review": "المراجعة",
  "nav.reading": "القراءة",
  "nav.progress": "التقدّم",
  "nav.account": "الحساب",

  "today.heading": "اليوم",
  "today.continueNow": "تابع الآن",
  "today.newMemory": "حفظ جديد",
  "today.keepStrong": "ثبّت حفظك",
  "today.teacherResponse": "ردّ المعلّم",
  "today.optionalPractice": "تدريب اختياري",
  "today.effortTarget": "هدف اليوم",
  "today.activeMinutes": "{minutes} دقيقة من التدريب الفعلي",
  "today.nothingDue": "لا شيء مستحقّ اليوم. هذا يوم هادئ، وليس يومًا فائتًا.",
  "today.start": "ابدأ",
  "today.continue": "تابع",
  "today.review": "راجع",

  "session.stage": "المرحلة {current} من {total}",
  "session.stage.orient": "التهيئة",
  "session.stage.listen": "الاستماع والربط",
  "session.stage.reconstruct": "إعادة التركيب",
  "session.stage.withdraw": "سحب المساعدات",
  "session.stage.prove": "إثبات الاستذكار المستقل",
  "session.stage.connect": "الوصل",
  "session.stage.recite": "التلاوة دون النظر",
  "session.stage.verify": "تصديق المعلّم",
  "session.stage.retain": "التثبيت والإصلاح",

  "session.listenCount": "الاستماع: {done} من {required}",
  "session.play": "استمع إلى الآية",
  "session.pause": "إيقاف مؤقّت",
  "session.speed": "سرعة التشغيل",
  "session.needHint": "أحتاج تلميحًا",
  "session.hintConsequence":
    "استخدام التلميح يسجّل هذه المحاولة تدريبًا، لا استذكارًا مستقلًّا.",
  "session.blankPage": "تبدأ الصفحة فارغة. تظهر الكلمات عندما تستذكرها.",
  "session.tileTray": "بطاقات الكلمات",
  "session.tileTrayHelp":
    "اختر الكلمة التالية. استخدم مفاتيح الأسهم للتنقّل بين البطاقات ومفتاح الإدخال لوضع بطاقة.",
  "session.placedWord": "وُضِعت الكلمة {position}",
  "session.readyToVerify": "جاهز لعرضه على معلّمك",

  "scaffold.full_tiles": "جميع الكلمات ظاهرة",
  "scaffold.fewer_tiles_with_anchors": "كلمات أقلّ مع مواضع ثابتة",
  "scaffold.gap_fill": "أكمل الفراغات",
  "scaffold.first_letter_cue": "الحروف الأولى فقط",
  "scaffold.no_answer_choices": "بلا خيارات معروضة",
  "scaffold.oral_blank_page": "التلاوة من صفحة فارغة",
  "scaffold.advanced": "تمّ تقليل المساعدة.",
  "scaffold.retreated": "تمّت زيادة المساعدة.",
  "scaffold.held": "المساعدة كما هي.",

  "state.assigned": "مُسنَد",
  "state.preparing": "قيد التهيئة",
  "state.recalled_independently": "استُذكِر باستقلال",
  "state.ready_for_verification": "جاهز للتصديق",
  "state.verified": "مُصدَّق",
  "state.established": "مُثبَّت",
  "state.durable": "راسخ",
  "state.fragile": "يحتاج تقوية",
  "state.repairing": "قيد الإصلاح",

  "evidence.independent": "بمفردك",
  "evidence.assisted": "بمساعدة",
  "evidence.scaffolded": "مع عرض الكلمات",
  "evidence.ofTotal": "{count} من {total}",
  "evidence.notRecorded": "غير مسجَّل",
  "evidence.notReviewed": "لم يُراجَع",
  "evidence.insufficient": "الأدلّة غير كافية بعد",
  "evidence.engineUnavailable": "مُجدوِل المراجعة غير متاح، فلا تُعرض مواعيد المراجعة.",

  "teach.attention": "ما يحتاج انتباهك",
  "teach.awaiting_verification": "بانتظار التصديق",
  "teach.repeated_corrections": "تصويبات متكرّرة",
  "teach.recall_decline": "تراجع في الاستذكار",
  "teach.not_started": "مُسنَد ولم يبدأ",
  "teach.review_overload": "تراكم المراجعات",
  "teach.inactivity": "طلاب بلا نشاط",
  "teach.governance_request": "طلبات إدارية",
  "teach.recently_improved": "تحسّن حديث",
  "teach.confidence": "درجة الثقة: {level}",
  "teach.confidence.high": "عالية",
  "teach.confidence.medium": "متوسّطة",
  "teach.confidence.low": "منخفضة",
  "teach.evidence": "الأدلّة",
  "teach.emptyInbox": "لا شيء يحتاج انتباهك الآن.",

  "verify.heading": "التصديق",
  "verify.expectedPassage": "المقطع المطلوب",
  "verify.priorCorrections": "التصويبات السابقة",
  "verify.cueHistory": "سجلّ المساعدات",
  "verify.advisorySignal": "إشارة استرشادية",
  "verify.advisoryCaveat":
    "التعرّف على الصوت استرشادي فقط، ولا يصلح للتصديق على التلاوة.",
  "verify.decision": "القرار",
  "verify.verified_cleanly": "مُصدَّق دون ملاحظات",
  "verify.verified_minor_slip": "مُصدَّق مع زلّة يسيرة",
  "verify.practice_again": "يحتاج مزيد تدريب",
  "verify.unable_to_assess": "تعذّر التقييم",
  "verify.addCorrection": "أضف تصويبًا",
  "verify.note": "ملاحظة",
  "verify.saveAndNext": "احفظ وانتقل إلى الطالب التالي",

  "family.heading": "ابني/ابنتي",
  "family.thisWeek": "هذا الأسبوع",
  "family.teacherAsked": "ما طلبه المعلّم",
  "family.homeTasks": "مهامّ المنزل",
  "family.assignedBy": "أسندها {name}",
  "family.checkedBy": "تحقّق منها {name} في {date}",
  "family.noPractice": "لا تدريب مسجَّل في {date}.",
  "family.lastVerification": "آخر تصديق من المعلّم: {date} — {decision}",

  "state.loading": "جارٍ التحميل",
  "state.empty": "لا شيء هنا بعد",
  "state.stale": "آخر تحديث قبل {minutes} دقيقة",
  "state.denied": "لا تملك صلاحية الوصول إلى هذا.",
  "state.deniedHelp": "يمكن لمدير الأكاديمية منحك الصلاحية.",
  "state.offline": "أنت غير متّصل. عملك محفوظ وسيُزامَن لاحقًا.",
  "state.error": "حدث خطأ ما.",
  "state.retry": "أعد المحاولة",
};

export const catalogues: Record<Locale, Record<MessageKey, string>> = { en, ar };

/**
 * Look up a message and interpolate `{named}` placeholders.
 *
 * A missing placeholder value is left visible as `{name}` rather than
 * silently blanked: a visible defect is better than a sentence that reads
 * as complete but says less than it should.
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  values: Readonly<Record<string, string | number>> = {},
): string {
  const template = catalogues[locale][key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

export function translatorFor(locale: Locale) {
  return (key: MessageKey, values?: Readonly<Record<string, string | number>>) =>
    translate(locale, key, values);
}
