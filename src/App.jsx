// PahaadCare - main app: onboarding, patient/doctor dashboards, medicines, SOS, GPS, reports
import React from 'react'
import { jsx, jsxs, Fragment } from 'react/jsx-runtime'
const _ = React
const i = { jsx, jsxs, Fragment }

import { Activity as Nf, ArrowRight as Tt, Bell as sc, CalendarDays as Cf, Check as fl, ChevronLeft as Ef, ChevronRight as oc, CircleCheck as yo, Clock3 as ac, CloudOff as Pf, FileHeart as pl, HeartPulse as kr, Hospital as go, House as zf, LogOut as xo, MapPin as Ei, MessageCircle as Mf, Mic as _f, Pill as wr, Plus as hl, Search as Rf, Settings as uc, ShieldCheck as Lt, Stethoscope as Pi, TriangleAlert as $n, UserRound as Lf, Users as vc, Volume2 as cc, WifiOff as Tf, Wifi as Of, X as dc } from 'lucide-react'
import { jf } from './Login'
import RpmDashboard from './RpmDashboard'

const Df = [
    [
      "Choose your language",
      "अपनी भाषा चुनें",
      "अपणि भाषा चुना",
      "आपणि भाषा चुनो",
      "अपणी भाषा चुणो",
    ],
    [
      "Who are you?",
      "आप कौन हैं?",
      "तुम कौन छा?",
      "तुम को छा?",
      "तुसां कुण हो?",
    ],
    ["Patient", "मरीज़", "बिमार", "बिमार", "रोगी"],
    [
      "Family member",
      "परिवार सदस्य",
      "परिवार कु सदस्य",
      "परिवार क सदस्य",
      "परिवार दा मेंबर",
    ],
    ["Doctor", "डॉक्टर", "डाक्टर", "डाक्टर", "डाक्टर"],
    ["Patient code", "मरीज़ कोड", "मरीज़ कोड", "मरीज़ कोड", "मरीज़ कोड"],
    ["Open patient", "मरीज़ देखें", "मरीज़ देखा", "मरीज़ देखो", "मरीज़ देखो"],
    ["Back", "वापस", "पैथर", "पछिल", "पिच्छे"],
    [
      "Call 112",
      "112 पर कॉल करें",
      "112 पर फोन करा",
      "112 में फोन करो",
      "112 उप्पर फोन करो",
    ],
    [
      "Ambulance 108",
      "एम्बुलेंस 108",
      "एम्बुलेंस 108",
      "एम्बुलेंस 108",
      "एम्बुलेंस 108",
    ],
    [
      "My location",
      "मेरी लोकेशन",
      "म्यारि लोकेशन",
      "म्यरि लोकेशन",
      "मेरी लोकेशन",
    ],
    ["Stop", "बंद करें", "बंद करा", "बंद करो", "बंद करो"],
    [
      "Time for medicine",
      "दवा का समय",
      "दवै कु टैम",
      "दवै क टैम",
      "दवाई दा टैम",
    ],
    ["Add medicine", "दवा जोड़ें", "दवै जोड़ा", "दवै जोड़ो", "दवाई जोड़ो"],
    [
      "Family members",
      "परिवार के सदस्य",
      "परिवार का सदस्य",
      "परिवार क सदस्य",
      "परिवार दे मेंबर",
    ],
    [
      "My reports",
      "मेरी रिपोर्ट",
      "म्यारि रिपोर्ट",
      "म्यरि रिपोर्ट",
      "मेरियां रिपोर्टां",
    ],
    ["View", "देखें", "देखा", "देखो", "देखो"],
    ["Delete", "हटाएँ", "हटा", "हटाओ", "हटाओ"],
    ["Log out", "लॉग आउट", "लॉग आउट", "लॉग आउट", "लॉग आउट"],
    ["Attach file", "फ़ाइल जोड़ें", "फाइल जोड़ा", "फाइल जोड़ो", "फाइल जोड़ो"],
    [
      "Save profile",
      "प्रोफ़ाइल सहेजें",
      "प्रोफाइल सैव करा",
      "प्रोफाइल सैव करो",
      "प्रोफाइल सैव करो",
    ],
    [
      "Care for the hills",
      "पहाड़ों के लिए स्वास्थ्य सेवा",
      "पहाड़ु खुण सेहत सेवा",
      "पहाड़ों हुणि सेहत सेवा",
      "पहाड़ां आस्ते सेहत सेवा",
    ],
  ],
  yc = { hi: {}, gar: {}, kum: {}, him: {} };
Df.forEach((k) =>
  ["hi", "gar", "kum", "him"].forEach((N, h) => {
    yc[N][k[0]] = k[h + 1];
  }),
);
function gc({ file: k, onClose: N, tr: h }) {
  return i.jsx("div", {
    className: "modal-backdrop",
    onMouseDown: (Y) => {
      Y.target === Y.currentTarget && N();
    },
    children: i.jsxs("div", {
      className: "modal sos-modal",
      children: [
        i.jsx("h3", { children: k.name }),
        k.type.startsWith("image/")
          ? i.jsx("img", { className: "ob-preview", src: k.data, alt: k.name })
          : i.jsx("p", {
              children:
                "File saved on this device. Preview is available for images.",
            }),
        i.jsx("button", {
          className: "button button-secondary",
          onClick: N,
          children: h("Back"),
        }),
      ],
    }),
  });
}
function Wn(k, N) {
  try {
    const h = localStorage.getItem(k);
    return h ? JSON.parse(h) : N;
  } catch {
    return N;
  }
}
const jo = () =>
    i.jsx("span", { className: "ob-logo", children: i.jsx(kr, { size: 54 }) }),
  If = [
    ["en", "English"],
    ["hi", "हिन्दी"],
    ["gar", "गढ़वाली"],
    ["kum", "कुमाऊँनी"],
    ["him", "हिमाचली पहाड़ी"],
  ],
  fc = [
    ["name", "Full name"],
    ["age", "Age"],
    ["phone", "Phone"],
    ["reg", "Medical registration no."],
    ["qual", "Educational qualification (MBBS, MD...)"],
    ["college", "College / University"],
    ["spec", "Specialization"],
    ["exp", "Experience (years)"],
    ["hospital", "Current hospital"],
    ["past", "Past hospitals"],
    ["langs", "Languages spoken"],
    ["about", "About"],
  ];
// ============ FIRST-TIME ONBOARDING (language + role selection) ============
function Af({ language: k, setLanguage: N, tr: h, onPatient: Y }) {
  const [O, U] = _.useState(
      localStorage.getItem("pc-language") ? "role" : "lang",
    ),
    [re, pe] = _.useState(""),
    [V, fe] = _.useState(""),
    [Z, le] = _.useState(null),
    [X, he] = _.useState(() => Wn("pc-doctor", {}));
  _.useEffect(() => {
    if (O !== "splash") return;
    const B = window.setTimeout(
      () => U(localStorage.getItem("pc-language") ? "role" : "lang"),
      1800,
    );
    return () => clearTimeout(B);
  }, [O]);
  function Ce(B) {
    B == null || B.preventDefault();
    const q = re.trim().toUpperCase();
    q &&
    (localStorage.getItem("pc-data-" + q) ||
      q === String(Wn("pc-patient-id", "")).toUpperCase())
      ? (fe(""), U("famview"))
      : fe("Patient not found on this device.");
  }
  const Q = (B) =>
      i.jsxs("button", {
        className: "text-button ob-back",
        onClick: () => U(B),
        children: [i.jsx(Ef, { size: 15 }), " ", h("Back")],
      }),
    $ = i.jsxs("form", {
      className: "record-form",
      onSubmit: Ce,
      children: [
        i.jsxs("label", {
          children: [
            h("Patient code"),
            i.jsx("input", {
              value: re,
              onChange: (B) => pe(B.target.value),
              placeholder: "PC-ABC123",
              required: true,
            }),
          ],
        }),
        i.jsxs("button", {
          className: "button button-primary",
          type: "submit",
          children: [h("Open patient"), " ", i.jsx(Tt, { size: 16 })],
        }),
        V && i.jsx("p", { className: "record-muted", children: V }),
      ],
    });
  if (O === "splash")
    return i.jsxs("div", {
      className: "ob-screen",
      children: [
        i.jsx(jo, {}),
        i.jsx("h1", { children: "PahaadCare" }),
        i.jsx("p", { children: h("Care for the hills") }),
      ],
    });
  if (O === "lang")
    return i.jsxs("div", {
      className: "ob-screen",
      children: [
        i.jsx(jo, {}),
        i.jsx("h2", { children: h("Choose your language") }),
        If.map(([B, q]) =>
          i.jsx(
            "button",
            {
              className: `button ${k === B ? "button-primary" : "button-secondary"} ob-wide`,
              onClick: () => {
                (N(B), U("role"));
              },
              children: q,
            },
            B,
          ),
        ),
      ],
    });
  if (O === "role")
    return i.jsxs("div", {
      className: "ob-screen",
      children: [
        i.jsx(jo, {}),
        i.jsx("h2", { children: h("Who are you?") }),
        i.jsxs("button", {
          className: "button button-primary ob-wide",
          onClick: Y,
          children: [i.jsx(Lf, { size: 18 }), " ", h("Patient")],
        }),
        i.jsxs("button", {
          className: "button button-secondary ob-wide",
          onClick: () => U("fam"),
          children: [i.jsx(vc, { size: 18 }), " ", h("Family member")],
        }),
        i.jsxs("button", {
          className: "button button-secondary ob-wide",
          onClick: () => U(X.name ? "docview" : "docreg"),
          children: [i.jsx(Pi, { size: 18 }), " ", h("Doctor")],
        }),
        i.jsx("button", {
          className: "text-button",
          onClick: () => U("lang"),
          children: h("Choose your language"),
        }),
      ],
    });
  if (O === "fam")
    return i.jsxs("div", {
      className: "ob-screen ob-card panel",
      children: [Q("role"), i.jsx("h2", { children: h("Family member") }), $],
    });
  if (O === "famview") {
    const B = re.trim().toUpperCase(),
      q = Wn("pc-data-" + B, null),
      ze = (q == null ? void 0 : q.patient) ?? Wn("pc-patient", {}),
      Ee = (q == null ? void 0 : q.reports) ?? Wn("pc-reports", []),
      Qe = (q == null ? void 0 : q.medicines) ?? Wn("pc-meds", []),
      Me = (q == null ? void 0 : q.members) ?? Wn("pc-members", []),
      De = (te) => {
        var it;
        return (
          ((it = Me.find((je) => je.id === te)) == null ? void 0 : it.name) ||
          "Self"
        );
      };
    return i.jsxs("div", {
      className: "ob-screen ob-card panel ob-left",
      children: [
        Q(X.name && !re ? "docview" : "fam"),
        i.jsxs("div", {
          className: "family-report",
          children: [
            i.jsxs("h3", { children: [ze.name, " — ", B] }),
            i.jsxs("p", {
              children: [
                i.jsx("strong", { children: "Blood group:" }),
                " ",
                ze.bloodGroup,
                " · ",
                i.jsx("strong", { children: "Allergies:" }),
                " ",
                ze.allergies || "-",
              ],
            }),
            i.jsxs("p", {
              children: [
                i.jsx("strong", { children: "Conditions:" }),
                " ",
                ze.conditions || "-",
              ],
            }),
            i.jsx("h4", { children: h("Medicines") }),
            Qe.map((te) =>
              i.jsxs(
                "p",
                {
                  className: "log-line",
                  children: [
                    i.jsx("span", { children: te.name }),
                    i.jsx("span", { children: te.time }),
                  ],
                },
                te.id,
              ),
            ),
            i.jsx("h4", { children: h("Family members") }),
            Me.map((te) => i.jsx("p", { children: te.name }, te.id)),
            i.jsxs("h4", { children: [h("My reports"), " (", Ee.length, ")"] }),
            Ee.map((te) =>
              i.jsxs(
                "div",
                {
                  className: "report-item",
                  children: [
                    i.jsx("strong", { children: te.title }),
                    i.jsxs("small", {
                      children: [
                        De(te.member),
                        " · ",
                        te.doctor,
                        " · ",
                        te.date,
                      ],
                    }),
                    i.jsx("p", { children: te.notes }),
                    te.file &&
                      i.jsx("button", {
                        className: "button button-secondary",
                        onClick: () => le(te.file),
                        children: h("View"),
                      }),
                  ],
                },
                te.id,
              ),
            ),
          ],
        }),
        Z && i.jsx(gc, { file: Z, onClose: () => le(null), tr: h }),
      ],
    });
  }
  return O === "docreg"
    ? i.jsxs("div", {
        className: "ob-screen ob-card panel",
        children: [
          Q("role"),
          i.jsx("h2", { children: h("Doctor") }),
          i.jsxs("form", {
            className: "record-form",
            onSubmit: (B) => {
              (B.preventDefault(),
                localStorage.setItem("pc-doctor", JSON.stringify(X)),
                U("docview"));
            },
            children: [
              fc.map(([B, q]) =>
                i.jsxs(
                  "label",
                  {
                    children: [
                      q,
                      i.jsx("input", {
                        value: X[B] || "",
                        onChange: (ze) => he({ ...X, [B]: ze.target.value }),
                        required: B === "name" || B === "qual",
                      }),
                    ],
                  },
                  B,
                ),
              ),
              i.jsx("button", {
                className: "button button-primary",
                type: "submit",
                children: h("Save profile"),
              }),
            ],
          }),
        ],
      })
    : i.jsxs("div", {
        className: "ob-screen ob-card panel ob-left",
        children: [
          Q("role"),
          i.jsxs("h2", { children: ["Dr. ", X.name] }),
          fc
            .slice(1)
            .map(([B, q]) =>
              i.jsxs(
                "p",
                {
                  children: [
                    i.jsxs("strong", { children: [q, ":"] }),
                    " ",
                    X[B] || "-",
                  ],
                },
                B,
              ),
            ),
          i.jsx("button", {
            className: "button button-secondary",
            onClick: () => U("docreg"),
            children: h("Save profile"),
          }),
          i.jsx("h3", { children: h("Open patient") }),
          $,
        ],
      });
}
const Ff = {
    name: "Aarav Rawat",
    village: "Maldevta, Dehradun",
    bloodGroup: "B+",
    allergies: "Penicillin",
    conditions: "Asthma",
  },
  Uf = [
    {
      id: 1,
      name: "Example medicine A",
      dose: "As prescribed · 1 tablet",
      time: "08:00 AM",
      taken: false,
      remaining: 5,
      total: 30,
    },
    {
      id: 2,
      name: "Example medicine B",
      dose: "As prescribed · 1 dose",
      time: "08:00 PM",
      taken: false,
      remaining: 12,
      total: 30,
    },
  ],
  Hf = [
    {
      name: "Dr. Meera Joshi",
      speciality: "General Physician",
      mode: "Online appointment",
      initials: "MJ",
      color: "mint",
    },
    {
      name: "Dr. Arjun Bisht",
      speciality: "Family Medicine",
      mode: "Referral requests",
      initials: "AB",
      color: "peach",
    },
    {
      name: "Community Health Centre",
      speciality: "Nearby health centre",
      mode: "Call to confirm services",
      initials: "CH",
      color: "blue",
    },
  ],
  Vf = [
    {
      name: "Hillview Medical Store",
      area: "Maldevta Road · Demo listing",
      distance: "2.4 km",
      status: "Call to confirm",
      tone: "amber",
    },
    {
      name: "Valley Care Pharmacy",
      area: "Raipur · Demo listing",
      distance: "5.8 km",
      status: "Stock not verified",
      tone: "slate",
    },
    {
      name: "Community Health Centre",
      area: "Nearest listed health centre · Demo",
      distance: "6.1 km",
      status: "Contact before travel",
      tone: "green",
    },
  ];
// helper: safe localStorage JSON read
function wt(k, N) {
  try {
    const h = localStorage.getItem(k);
    return h ? JSON.parse(h) : N;
  } catch {
    return N;
  }
}
let Sr;
typeof document < "u" &&
  document.addEventListener("click", () => {
    try {
      ((Sr = Sr || new (window.AudioContext || window.webkitAudioContext)()),
        Sr.resume());
    } catch {}
  });
function Bf(k) {
  var O;
  const N = k.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!N) return "";
  let h = +N[1];
  const Y = (O = N[3]) == null ? void 0 : O.toUpperCase();
  return (
    Y === "PM" && h < 12 && (h += 12),
    Y === "AM" && h === 12 && (h = 0),
    `${String(h).padStart(2, "0")}:${N[2]}`
  );
}
function $f(k) {
  return new Promise((N, h) => {
    const Y = new FileReader();
    ((Y.onload = () =>
      N({ name: k.name, type: k.type, data: String(Y.result) })),
      (Y.onerror = h),
      Y.readAsDataURL(k));
  });
}
function Wf() {
  return i.jsx("span", {
    "aria-hidden": "true",
    className: "language-symbol",
    children: "文",
  });
}
// ============ GPS: demo place coordinates + distance formula ============
// Replace these demo coordinates with REAL [latitude, longitude] of your pharmacies/centres.
const PCXY = {
  "Hillview Medical Store": [30.37, 78.13],
  "Valley Care Pharmacy": [30.305, 78.095],
  "Community Health Centre": [30.33, 78.05],
};
function pcD(g, c) {
  const R = 6371,
    r = (x) => (x * Math.PI) / 180,
    a =
      Math.sin(r(c[0] - g.lat) / 2) ** 2 +
      Math.cos(r(g.lat)) *
        Math.cos(r(c[0])) *
        Math.sin(r(c[1] - g.lon) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
// ============ MEDICINE LIST 1-90 (shown in Find Care page) ============
// Edit / add medicines here: { n: number, name: "...", use: "..." }
const MedList = [
  { n: 1, name: "Paracetamol", use: "Bukhar, dard" },
  { n: 2, name: "Ibuprofen", use: "Dard, sujan" },
  { n: 3, name: "Cetirizine", use: "Allergy, chheenk" },
  { n: 4, name: "Levocetirizine", use: "Naak behna, allergy" },
  { n: 5, name: "Domperidone", use: "Ulti rokne ke liye" },
  { n: 6, name: "Ondansetron", use: "Matli, ulti" },
  { n: 7, name: "Pantoprazole", use: "Gas, acidity" },
  { n: 8, name: "Rabeprazole", use: "Pet ki jalan" },
  { n: 9, name: "Ranitidine", use: "Acidity" },
  { n: 10, name: "Omeprazole", use: "Gas, pet dard" },
  { n: 11, name: "Amoxicillin", use: "Bacterial infection" },
  { n: 12, name: "Azithromycin", use: "Gala, chest infection" },
  { n: 13, name: "Ciprofloxacin", use: "UTI, bacterial infection" },
  { n: 14, name: "Doxycycline", use: "Bacterial infection" },
  { n: 15, name: "Metronidazole", use: "Pet infection, loose motion" },
  { n: 16, name: "Tinidazole", use: "Pet ka infection" },
  { n: 17, name: "Norfloxacin", use: "UTI, loose motion" },
  { n: 18, name: "Ofloxacin", use: "Bacterial infection" },
  { n: 19, name: "Clindamycin", use: "Skin infection" },
  { n: 20, name: "Erythromycin", use: "Gala infection" },
  { n: 21, name: "Nimesulide", use: "Bukhar, dard" },
  { n: 22, name: "Mefenamic Acid", use: "Period pain" },
  { n: 23, name: "Aspirin", use: "Dard, blood thinner" },
  { n: 24, name: "Tramadol", use: "Tez dard" },
  { n: 25, name: "Diclofenac", use: "Joint pain" },
  { n: 26, name: "Aceclofenac", use: "Dard, sujan" },
  { n: 27, name: "Chlorpheniramine", use: "Sardi, allergy" },
  { n: 28, name: "Phenylephrine", use: "Band naak" },
  { n: 29, name: "Betadine Ointment", use: "Zakhm par lagaye" },
  { n: 30, name: "Neomycin Cream", use: "Skin infection" },
  { n: 31, name: "Silver Sulfadiazine", use: "Jalne par" },
  { n: 32, name: "Hydrocortisone", use: "Khujli, allergy" },
  { n: 33, name: "Clobetasol", use: "Skin sujan" },
  { n: 34, name: "Miconazole", use: "Fungal infection" },
  { n: 35, name: "Clotrimazole", use: "Khujli, fungal infection" },
  { n: 36, name: "Ketoconazole", use: "Dandruff, fungal infection" },
  { n: 37, name: "Loratadine", use: "Allergy" },
  { n: 38, name: "Montelukast", use: "Allergy, saans ki problem" },
  { n: 39, name: "Salbutamol", use: "Asthma, saans phoolna" },
  { n: 40, name: "Ipratropium", use: "Saans lene mein dikkat" },
  { n: 41, name: "Theophylline", use: "Asthma" },
  { n: 42, name: "Budesonide", use: "Saans ki sujan" },
  { n: 43, name: "Fluticasone", use: "Allergy, sardi" },
  { n: 44, name: "Formoterol", use: "Bronchitis, asthma" },
  { n: 45, name: "Beclomethasone", use: "Naak ki allergy" },
  { n: 46, name: "Saline Nasal Spray", use: "Sukhi naak" },
  { n: 47, name: "Xylometazoline", use: "Band naak" },
  { n: 48, name: "Ambroxol", use: "Balgam patla karta hai" },
  { n: 49, name: "Guaifenesin", use: "Khansi mein balgam nikalne mein help" },
  { n: 50, name: "Dextromethorphan", use: "Sukhi khansi" },
  { n: 51, name: "Codeine", use: "Tez khansi" },
  { n: 52, name: "Chlorzoxazone", use: "Muscle pain" },
  { n: 53, name: "Tizanidine", use: "Muscle tightness" },
  { n: 54, name: "Thiocolchicoside", use: "Gardan dard, muscle spasm" },
  { n: 55, name: "Cyclobenzaprine", use: "Back pain, muscle spasm" },
  { n: 56, name: "Albendazole", use: "Pet ke keede" },
  { n: 57, name: "Mebendazole", use: "Keede ki dawai" },
  { n: 58, name: "Levamisole", use: "Bachchon ke keede" },
  { n: 59, name: "Diethylcarbamazine", use: "Filariasis" },
  { n: 60, name: "Ivermectin", use: "Scabies, keede" },
  { n: 61, name: "Zinc Tablet", use: "Immunity support" },
  { n: 62, name: "ORS Powder", use: "Dehydration" },
  { n: 63, name: "Vitamin C", use: "Immunity support" },
  { n: 64, name: "Vitamin D3", use: "Haddi mazboot" },
  { n: 65, name: "Calcium", use: "Haddi, daant" },
  { n: 66, name: "Iron + Folic Acid", use: "Khoon ki kami" },
  { n: 67, name: "Multivitamins", use: "Vitamin deficiency" },
  { n: 68, name: "Biotin", use: "Baal, skin, nails" },
  { n: 69, name: "B-Complex", use: "Thakan, vitamin deficiency" },
  { n: 70, name: "Cyanocobalamin", use: "Vitamin B12 deficiency" },
  { n: 71, name: "Metformin", use: "Diabetes" },
  { n: 72, name: "Glibenclamide", use: "Diabetes" },
  { n: 73, name: "Gliclazide", use: "Diabetes" },
  { n: 74, name: "Insulin", use: "Blood sugar control" },
  { n: 75, name: "Pioglitazone", use: "Diabetes" },
  { n: 76, name: "Amlodipine", use: "High BP" },
  { n: 77, name: "Telmisartan", use: "High BP" },
  { n: 78, name: "Losartan", use: "High BP" },
  { n: 79, name: "Atenolol", use: "BP, heart rate control" },
  { n: 80, name: "Metoprolol", use: "Dil ki dhadkan, BP" },
  { n: 81, name: "Furosemide", use: "Body se extra paani nikalna" },
  { n: 82, name: "Spironolactone", use: "Sujan, water retention" },
  { n: 83, name: "Digoxin", use: "Heart failure" },
  { n: 84, name: "Nitroglycerin", use: "Seene ka dard" },
  { n: 85, name: "Isosorbide Dinitrate", use: "Heart disease" },
  { n: 86, name: "Atorvastatin", use: "Cholesterol kam karna" },
  { n: 87, name: "Rosuvastatin", use: "Cholesterol kam karna" },
  { n: 88, name: "Clopidogrel", use: "Blood clot rokna" },
  { n: 89, name: "Warfarin", use: "Blood thinner" },
  { n: 90, name: "Heparin", use: "Blood clot rokna" },
];
// ============ MAIN APP: all pages, SOS, Edit profile, medicines, reports ============
function Qf() {
  const [k, N] = _.useState("Overview"),
    [h, Y] = _.useState(() => wt("pc-auth-user", "")),
    [O, U] = _.useState(() => wt("pc-patient-id", "")),
    [re, pe] = _.useState(() => wt("pc-family-code", "4826")),
    [V, fe] = _.useState(() => wt("pc-reports", [])),
    [Z, le] = _.useState(() => wt("pc-dose-logs", [])),
    [X, he] = _.useState(""),
    [Ce, Q] = _.useState(""),
    [$, B] = _.useState(false),
    [q, ze] = _.useState(""),
    [Ee, Qe] = _.useState(""),
    [Me, De] = _.useState(""),
    [te, it] = _.useState(""),
    [je, Ot] = _.useState(() => wt("pc-language", "en")),
    [st, Be] = _.useState(""),
    [ot, at] = _.useState(() =>
      wt("pc-role", wt("pc-auth-user", "") ? "patient" : ""),
    ),
    [ke, me] = _.useState(() =>
      wt("pc-members", [{ id: "self", name: "Self" }]),
    ),
    [E, D] = _.useState(""),
    [z, p] = _.useState("self"),
    [g, W] = _.useState(null),
    [K, ee] = _.useState(0),
    [b, ae] = _.useState(null),
    [se, ce] = _.useState(false),
    [Ye, Zt] = _.useState(""),
    [kt, Sn] = _.useState(null),
    [Nn, Nr] = _.useState(""),
    [Cr, Qn] = _.useState(""),
    [Yn, Kn] = _.useState(""),
    bt = _.useRef(/* @__PURE__ */ new Set()),
    St = {
      "CARE THAT REACHES YOU": "आप तक पहुँचती देखभाल",
      "Profile settings": "प्रोफ़ाइल सेटिंग",
      "Your health. Your control.": "आपकी सेहत, आपका नियंत्रण।",
      English: "अंग्रेज़ी",
      "You’re offline.": "आप ऑफ़लाइन हैं।",
      "Your saved health details and medicine log remain available on this device.":
        "आपकी सेहत की जानकारी और दवाइयों का रिकॉर्ड इसी डिवाइस पर उपलब्ध है।",
      "Good morning, ": "सुप्रभात, ",
      "A little more peace of mind, wherever you are.":
        "आप जहाँ भी हों, मन की थोड़ी और शांति।",
      "Install app": "ऐप इंस्टॉल करें",
      "YOUR PERSONAL HEALTH SPACE": "आपकी निजी स्वास्थ्य जगह",
      "Care should travel": "देखभाल पहुँचे",
      "the extra mile.": "हर दूर जगह तक।",
      "Keep your essential health details close, track your medicine routine, and find care options around you.":
        "ज़रूरी स्वास्थ्य जानकारी पास रखें, दवाइयों का समय देखें और आसपास इलाज के विकल्प खोजें।",
      "View my health passport": "मेरा स्वास्थ्य रिकॉर्ड देखें",
      "Health passport": "स्वास्थ्य रिकॉर्ड",
      "Available on this device": "इस डिवाइस पर उपलब्ध",
      "Your health at a glance": "एक नज़र में आपकी सेहत",
      "Simple tools for your everyday care.":
        "रोज़मर्रा की देखभाल के आसान साधन।",
      "Up to date": "अप-टू-डेट",
      "Profile & key details": "प्रोफ़ाइल और ज़रूरी जानकारी",
      "Medicine routine": "दवा का समय",
      "Today’s sample schedule": "आज का नमूना समय",
      "Find care": "इलाज खोजें",
      "3 care options": "इलाज के 3 विकल्प",
      "Explore directory": "सूची देखें",
      "Medicine schedule": "दवा का समय",
      "Example schedule · Confirm all doses with your clinician.":
        "नमूना समय-सारणी · सभी खुराक डॉक्टर से पक्का करें।",
      "View all": "सभी देखें",
      "Reminder and log only — not medical advice.":
        "यह केवल याद दिलाने और रिकॉर्ड के लिए है—चिकित्सकीय सलाह नहीं।",
      "HERE WHEN IT MATTERS": "ज़रूरत के समय आपके साथ",
      "Reach official emergency support by phone. If you are in immediate danger, don’t wait for the app.":
        "फ़ोन से आधिकारिक आपातकालीन सहायता लें। तुरंत खतरा हो तो ऐप का इंतज़ार न करें।",
      "A phone or network connection is required.":
        "फ़ोन या नेटवर्क कनेक्शन ज़रूरी है।",
      "A small step toward connected care.":
        "जुड़ी हुई स्वास्थ्य सेवा की ओर एक छोटा कदम।",
      "PahaadCare is a demonstration prototype. Listings and medical entries are sample data, not verified live services.":
        "PahaadCare एक प्रदर्शन नमूना है। सूची और स्वास्थ्य जानकारी उदाहरण हैं, सत्यापित लाइव सेवाएँ नहीं।",
      "Explore care": "इलाज के विकल्प देखें",
      "YOUR PERSONAL RECORD": "आपका निजी रिकॉर्ड",
      "Essential information, kept close even when the network isn’t.":
        "ज़रूरी जानकारी पास रखें, नेटवर्क न होने पर भी।",
      "Sample profile · Stored on this device":
        "नमूना प्रोफ़ाइल · इसी डिवाइस पर सुरक्षित",
      "BLOOD GROUP": "रक्त समूह",
      "Known allergies": "ज्ञात एलर्जी",
      "Verify with your healthcare provider.":
        "अपने स्वास्थ्य सेवा प्रदाता से पुष्टि करें।",
      "Health conditions": "स्वास्थ्य संबंधी स्थितियाँ",
      "Sample information; not a diagnosis.":
        "यह नमूना जानकारी है, निदान नहीं।",
      "Medical documents": "चिकित्सकीय दस्तावेज़",
      "Common medicines list (1–90)": "आम दवाइयों की सूची (1–90)",
      "Medicine names and what they are commonly used for.":
        "दवाइयों के नाम और वे आम तौर पर किसलिए इस्तेमाल होती हैं।",
      "Search medicine or use, e.g. BP, dard":
        "दवा या बीमारी खोजें, जैसे BP, दर्द",
      "No medicine found.": "कोई दवा नहीं मिली।",
      "For information only. Take any medicine only on your doctor’s advice.":
        "केवल जानकारी के लिए। कोई भी दवा सिर्फ़ डॉक्टर की सलाह से लें।",
      "Near me": "मेरे पास",
      "Use my location": "मेरी लोकेशन इस्तेमाल करें",
      "Refresh location": "लोकेशन फिर से लें",
      "Location found": "लोकेशन मिल गई",
      "Use your phone GPS to find care and medicine shops around you.":
        "फ़ोन के GPS से अपने आसपास इलाज और दवा की दुकानें खोजें।",
      "Hospitals near me": "मेरे पास अस्पताल",
      "Pharmacies near me": "मेरे पास दवा की दुकानें",
      "Doctors and clinics near me": "मेरे पास डॉक्टर और क्लिनिक",
      "Your location": "आपकी लोकेशन",
      "Open in Maps": "मैप में खोलें",
      "Share on WhatsApp": "WhatsApp पर भेजें",
      "Send SMS": "SMS भेजें",
      "Copy location link": "लोकेशन लिंक कॉपी करें",
      "Location link copied.": "लोकेशन लिंक कॉपी हो गया।",
      "Could not copy.": "कॉपी नहीं हो सका।",
      "approx., demo coordinates": "अनुमानित, नमूना निर्देशांक",
      "Finding your location…": "आपकी लोकेशन खोजी जा रही है…",
      "This browser does not support GPS.":
        "इस ब्राउज़र में GPS की सुविधा नहीं है।",
      "GPS needs a secure (https) page. Open the app from its https link.":
        "GPS के लिए सुरक्षित (https) पेज चाहिए। ऐप को https लिंक से खोलें।",
      "Location permission is blocked. Allow Location for this site in browser settings.":
        "लोकेशन की अनुमति बंद है। ब्राउज़र सेटिंग में इस साइट के लिए Location की अनुमति दें।",
      "Turn on your phone GPS/Location and try again.":
        "फ़ोन का GPS/Location चालू करके फिर कोशिश करें।",
      "Location timed out. Move to an open area and try again.":
        "लोकेशन मिलने में देर हुई। खुली जगह में जाकर फिर कोशिश करें।",
      "Location not available.": "लोकेशन उपलब्ध नहीं है।",
      "Family contacts": "परिवार के संपर्क",
      Call: "कॉल करें",
      "Emergency contacts": "आपातकालीन संपर्क",
      "Saved on this device only. Used in SOS to send your location.":
        "केवल इसी डिवाइस पर सुरक्षित। SOS में लोकेशन भेजने के काम आता है।",
      Name: "नाम",
      "Phone number": "फ़ोन नंबर",
      "Add contact": "संपर्क जोड़ें",
      "Add contacts": "संपर्क जोड़ें",
      "Enter a name and a valid phone number.": "नाम और सही फ़ोन नंबर लिखें।",
      "Contact saved on this device.": "संपर्क इस डिवाइस पर सुरक्षित हुआ।",
      "Add family contacts in Edit profile to send help requests in one tap.":
        "एक टैप में मदद भेजने के लिए प्रोफ़ाइल बदलें में परिवार के संपर्क जोड़ें।",
      "Maximum 3 contacts.": "अधिकतम 3 संपर्क।",
      "Location is not ready. The message will go without your location.":
        "लोकेशन अभी नहीं मिली। संदेश बिना लोकेशन के जाएगा।",
      "Tip: tap Try again, or send your location inside WhatsApp (attach → Location). Open the app in Chrome, not inside another app.":
        "सुझाव: फिर कोशिश करें दबाएँ, या WhatsApp में (अटैच → Location) से लोकेशन भेजें। ऐप को Chrome में खोलें, किसी दूसरे ऐप के अंदर नहीं।",
      "Try again": "फिर कोशिश करें",
      "This page was opened as a file, so the browser blocks GPS. Put the app on an https link and open that link in Chrome.":
        "यह पेज फ़ाइल की तरह खुला है, इसलिए ब्राउज़र GPS रोक देता है। ऐप को https लिंक पर रखें और उस लिंक को Chrome में खोलें।",
      "Medical reports": "मेडिकल रिपोर्ट",
      "Upload medical report": "मेडिकल रिपोर्ट अपलोड करें",
      uploaded: "अपलोड",
      "Add reports from Edit profile.":
        "रिपोर्ट जोड़ने के लिए प्रोफ़ाइल बदलें खोलें।",
      "Image or PDF. Images are compressed automatically; PDF max 1 MB.":
        "फ़ोटो या PDF। फ़ोटो अपने आप छोटी हो जाती है; PDF अधिकतम 1 MB।",
      Download: "डाउनलोड",
      "No reports uploaded yet.": "अभी कोई रिपोर्ट अपलोड नहीं हुई।",
      "Report uploaded and saved on this device.":
        "रिपोर्ट अपलोड होकर इस डिवाइस पर सुरक्षित हुई।",
      "Storage is full. Remove an old report first.":
        "जगह भर गई है। पहले कोई पुरानी रिपोर्ट हटाएँ।",
      "Please choose an image or a PDF file.":
        "कृपया फ़ोटो या PDF फ़ाइल चुनें।",
      "PDF is too big (max 1 MB).": "PDF बहुत बड़ी है (अधिकतम 1 MB)।",
      "Could not read this file. Try another one.":
        "यह फ़ाइल पढ़ी नहीं जा सकी। दूसरी फ़ाइल चुनें।",
      "0 uploaded": "0 अपलोड किए गए",
      "Document upload is not connected in this demo.":
        "इस नमूने में दस्तावेज़ अपलोड की सुविधा जुड़ी नहीं है।",
      "Before sharing your records": "रिकॉर्ड साझा करने से पहले",
      "Privacy first, every time.": "हर बार, गोपनीयता पहले।",
      "This prototype stores profile details in your current browser on this device. It does not send them to a doctor or cloud server. Do not enter real sensitive health data until authentication, encryption, consent and access controls have been implemented and reviewed.":
        "यह नमूना आपकी प्रोफ़ाइल इसी डिवाइस के ब्राउज़र में रखता है। यह जानकारी डॉक्टर या क्लाउड सर्वर को नहीं भेजता। लॉगिन सुरक्षा, एन्क्रिप्शन, सहमति और पहुँच नियंत्रण लागू व जाँचे जाने तक असली संवेदनशील स्वास्थ्य जानकारी न डालें।",
      "YOUR DAILY ROUTINE": "आपकी रोज़ की दिनचर्या",
      "Track your schedule and keep a simple local log.":
        "अपना समय देखें और साधारण रिकॉर्ड रखें।",
      "Add medicine": "दवा जोड़ें",
      "Your schedule stays on this device":
        "आपकी समय-सारणी इसी डिवाइस पर रहती है",
      "Browser reminders may require permission and may not fire reliably when the browser is closed. This demo logs status but does not schedule guaranteed alerts.":
        "ब्राउज़र रिमाइंडर के लिए अनुमति चाहिए हो सकती है और ब्राउज़र बंद होने पर वे हमेशा नहीं बजेंगे। यह नमूना स्थिति दर्ज करता है, पक्के अलर्ट तय नहीं करता।",
      "Today’s schedule": "आज की समय-सारणी",
      Today: "आज",
      Logged: "दर्ज किया",
      "Mark taken": "ले ली गई चिह्नित करें",
      "Medication safety:": "दवा सुरक्षा:",
      "Use only the dose and timing prescribed by your licensed clinician. If you miss a dose, don’t double it unless your clinician or medicine instructions say to.":
        "केवल लाइसेंस प्राप्त चिकित्सक द्वारा बताई गई खुराक और समय अपनाएँ। खुराक छूट जाए तो डॉक्टर या दवा के निर्देश के बिना अगली खुराक दोगुनी न करें।",
      "YOUR CARE NETWORK": "आपकी स्वास्थ्य सेवा नेटवर्क",
      "Explore demo care listings. Please verify details before travelling.":
        "नमूना स्वास्थ्य सेवाएँ देखें। जाने से पहले जानकारी की पुष्टि करें।",
      "Sample directory": "नमूना सूची",
      "These are demonstration listings, not verified real providers. No live booking or teleconsultation is connected.":
        "ये प्रदर्शन के लिए दी गई सूचियाँ हैं, सत्यापित सेवा प्रदाता नहीं। लाइव बुकिंग या ऑनलाइन परामर्श जुड़ा नहीं है।",
      "Need a referral?": "रेफ़रल चाहिए?",
      "In the real service, a verified clinician can create a referral and share it securely with the receiving facility.":
        "वास्तविक सेवा में सत्यापित चिकित्सक रेफ़रल बनाकर संबंधित केंद्र से सुरक्षित रूप से साझा कर सकता है।",
      "Explore referral workflow": "रेफ़रल प्रक्रिया देखें",
      "LOCAL HEALTH RESOURCES": "स्थानीय स्वास्थ्य संसाधन",
      "Check contact details before making a long journey.":
        "लंबा सफ़र करने से पहले संपर्क विवरण जाँचें।",
      "Demo locations": "नमूना स्थान",
      "Sample directory only. Stock, distances, addresses and opening hours are not live or verified.":
        "यह केवल नमूना सूची है। उपलब्धता, दूरी, पते और खुलने का समय लाइव या सत्यापित नहीं हैं।",
      Details: "विवरण",
      "No matching demo listings. Try another search.":
        "इस खोज से मेल खाती सूची नहीं मिली। कोई और शब्द खोजें।",
      "© 2026 PahaadCare · Built for communities in the hills":
        "© 2026 PahaadCare · पहाड़ी समुदायों के लिए बनाया गया",
      "Prototype · Sample data only": "प्रोटोटाइप · केवल नमूना डेटा",
      "PERSONAL DETAILS": "व्यक्तिगत जानकारी",
      "Edit health profile": "स्वास्थ्य प्रोफ़ाइल बदलें",
      "Full name": "पूरा नाम",
      "Village / area": "गाँव / क्षेत्र",
      "Blood group": "रक्त समूह",
      Unknown: "अज्ञात",
      "Existing conditions": "मौजूदा स्वास्थ्य स्थितियाँ",
      "Demo profile only. Saved locally in this browser.":
        "केवल नमूना प्रोफ़ाइल। इसी ब्राउज़र में सेव है।",
      Cancel: "रद्द करें",
      "Save profile": "प्रोफ़ाइल सेव करें",
      "APPOINTMENT REQUEST": "अपॉइंटमेंट अनुरोध",
      "Request a visit": "मुलाक़ात का अनुरोध करें",
      "This is a demo. No doctor will receive this request.":
        "यह एक नमूना है। किसी डॉक्टर को यह अनुरोध नहीं मिलेगा।",
      "Reason for visit": "मुलाक़ात का कारण",
      "General consultation": "सामान्य परामर्श",
      "Follow-up": "फ़ॉलो-अप",
      "Referral discussion": "रेफ़रल पर चर्चा",
      "Medicine review": "दवा की समीक्षा",
      "Preferred mode": "पसंदीदा तरीका",
      "Phone consultation": "फ़ोन पर परामर्श",
      "Video consultation": "वीडियो परामर्श",
      "In-person visit": "व्यक्तिगत मुलाक़ात",
      "Submit demo request": "नमूना अनुरोध भेजें",
      Stores: "दुकानें",
      "You’re connected": "आप जुड़े हुए हैं",
      "Offline mode active": "ऑफ़लाइन मोड चालू है",
      "Local data is available": "इस डिवाइस का डेटा उपलब्ध है",
      "Saved health data is available": "सेव की गई स्वास्थ्य जानकारी उपलब्ध है",
      Online: "ऑनलाइन",
      Offline: "ऑफ़लाइन",
      "Saved on this device": "इस डिवाइस पर सेव है",
      "Medicine log updated on this device.":
        "दवा का रिकॉर्ड इस डिवाइस पर अपडेट हुआ।",
      "Profile saved locally.": "प्रोफ़ाइल इसी डिवाइस पर सेव हुई।",
      "You’re all caught up.": "अभी कोई नया नोटिफ़िकेशन नहीं है।",
      "Mark not taken": "नहीं ली गई चिह्नित करें",
      "Log as taken": "ली गई दर्ज करें",
      "Search pharmacy or area...": "दवा की दुकान या क्षेत्र खोजें...",
      "Choose language": "भाषा चुनें",
      "Read welcome aloud": "स्वागत संदेश सुनें",
      "Voice search pharmacies": "आवाज़ से दवा की दुकान खोजें",
      Notifications: "सूचनाएँ",
      "items marked as taken.": "दवाइयाँ ली गई चिह्नित हैं।",
      "General Physician": "सामान्य चिकित्सक",
      "Online appointment": "ऑनलाइन अपॉइंटमेंट",
      "Family Medicine": "परिवार चिकित्सा",
      "Referral requests": "रेफ़रल अनुरोध",
      "Nearby health centre": "नज़दीकी स्वास्थ्य केंद्र",
      "Call to confirm services": "सेवाओं की पुष्टि के लिए कॉल करें",
      "Hillview Medical Store": "हिलव्यू मेडिकल स्टोर",
      "Maldevta Road · Demo listing": "मालदेवता रोड · नमूना सूची",
      "Call to confirm": "पुष्टि के लिए कॉल करें",
      "Raipur · Demo listing": "रायपुर · नमूना सूची",
      "Stock not verified": "स्टॉक की पुष्टि नहीं हुई",
      "Nearest listed health centre · Demo":
        "सूचीबद्ध नज़दीकी स्वास्थ्य केंद्र · नमूना",
      "Contact before travel": "जाने से पहले संपर्क करें",
      "Example medicine A": "उदाहरण दवा A",
      "Example medicine B": "उदाहरण दवा B",
      "As prescribed · 1 tablet": "निर्देशानुसार · 1 गोली",
      "As prescribed · 1 dose": "निर्देशानुसार · 1 खुराक",
      "None recorded": "कोई जानकारी दर्ज नहीं है",
      "Search pharmacies": "दवा की दुकानें खोजें",
      "View details": "विवरण देखें",
      "Request visit": "मुलाक़ात का अनुरोध करें",
      Home: "मुख्य पृष्ठ",
      Health: "सेहत",
      Care: "इलाज",
      "Text-to-speech is not supported in this browser.":
        "इस ब्राउज़र में टेक्स्ट को आवाज़ में सुनाने की सुविधा उपलब्ध नहीं है।",
      "Using the closest available device voice. Local dialect pronunciation may vary.":
        "डिवाइस में उपलब्ध आवाज़ का उपयोग हो रहा है। स्थानीय बोली का उच्चारण अलग हो सकता है।",
      "Speech input is not supported in this browser. Try current Chrome.":
        "इस ब्राउज़र में आवाज़ से लिखने की सुविधा नहीं है। नए Chrome में कोशिश करें।",
      "Voice search captured. Please check the recognized words.":
        "आवाज़ से खोज दर्ज हुई। पहचाने गए शब्द जाँच लें।",
      "Could not recognize speech. Try again or type your search.":
        "आवाज़ समझ नहीं आई। फिर कोशिश करें या खोज लिखें।",
      "On Android Chrome, open the menu and choose “Install app” or “Add to Home screen”.":
        "Android Chrome में मेन्यू खोलें और “ऐप इंस्टॉल करें” या “होम स्क्रीन पर जोड़ें” चुनें।",
      "For this demo, medicine entries are examples. Ask your clinician before adding a real schedule.":
        "इस नमूने में दवाइयों की जानकारी उदाहरण है। असली समय-सारणी जोड़ने से पहले डॉक्टर से पूछें।",
      "Demo only: referral workflow is not connected to a clinician.":
        "केवल नमूना: रेफ़रल प्रक्रिया किसी डॉक्टर से जुड़ी नहीं है।",
      "Demo listing: live phone number and navigation are not connected.":
        "नमूना सूची: असली फ़ोन नंबर और रास्ते की सुविधा जुड़ी नहीं है।",
      "Demo request only — no appointment has been booked.":
        "यह केवल नमूना अनुरोध है—कोई अपॉइंटमेंट बुक नहीं हुई।",
      "Good morning,": "सुप्रभात,",
      logged: "दर्ज",
      of: "में से",
      "Patient Records": "मरीज़ का रिकॉर्ड",
      "Patient ID": "मरीज़ आईडी",
      "Family access": "परिवार की पहुँच",
      "Doctor report": "डॉक्टर की रिपोर्ट",
      "Medicine stock": "दवा का बचा स्टॉक",
      "Refill soon": "जल्द दवा लें",
      "Access code": "पहुँच कोड",
      "Unlock family view": "परिवार का रिकॉर्ड खोलें",
      "Share report": "रिपोर्ट भेजें",
    },
    Er = {
      hi: {
        ...St,
        Overview: "मुख्य पृष्ठ",
        "My Health": "मेरी सेहत",
        Medicines: "दवाइयाँ",
        "Find Care": "इलाज खोजें",
        Pharmacies: "दवा की दुकानें",
        WORKSPACE: "कार्यस्थान",
        "YOUR HEALTH, CLOSER TO HOME": "आपकी सेहत, आपके करीब",
        "Need urgent help?": "तुरंत मदद चाहिए?",
        "My health passport": "मेरा स्वास्थ्य रिकॉर्ड",
        "Medicine management": "दवाइयों का प्रबंधन",
        "Find care near you": "अपने पास इलाज खोजें",
        "Pharmacies & centres": "दवा की दुकानें और केंद्र",
        "Edit profile": "प्रोफ़ाइल बदलें",
        "Call emergency services": "आपातकालीन सेवा पर कॉल करें",
      },
      gar: {
        ...St,
        Overview: "मुख्य पन्ना",
        "My Health": "म्यरि सेहत",
        Medicines: "दवाई",
        "Find Care": "इलाज खोजा",
        Pharmacies: "दवाई की दुकान",
        "Need urgent help?": "फौरन मदद चैं?",
        "My health passport": "म्यरु स्वास्थ्य रिकॉर्ड",
        WORKSPACE: "कामकाज",
        "YOUR HEALTH, CLOSER TO HOME": "तुमारी सेहत, तुमरै नज़दीक",
      },
      kum: {
        ...St,
        Overview: "मुख्य पन्न",
        "My Health": "म्यरि सेहत",
        Medicines: "दवाई",
        "Find Care": "इलाज खोजूं",
        Pharmacies: "दवाई की दुकान",
        "Need urgent help?": "जल्दी मदद चैं?",
        "My health passport": "म्यरु स्वास्थ्य रिकॉर्ड",
        WORKSPACE: "कामकाज",
        "YOUR HEALTH, CLOSER TO HOME": "तुमरि सेहत, तुमरै नज़दीक",
      },
      him: {
        ...St,
        Overview: "मुख्य पन्ना",
        "My Health": "मेरी सेहत",
        Medicines: "दवाइयाँ",
        "Find Care": "इलाज ढूँढो",
        Pharmacies: "दवाई दी दुकान",
        "Need urgent help?": "फटाफट मदद चाहिदी?",
        "My health passport": "मेरा स्वास्थ्य रिकॉर्ड",
        WORKSPACE: "कामकाज",
        "YOUR HEALTH, CLOSER TO HOME": "तुहाडी सेहत, तुहाडे नेड़े",
      },
    },
    f = (c) => {
      var C, F;
      return (
        ((C = Er[je]) == null ? void 0 : C[c]) ||
        ((F = yc[je]) == null ? void 0 : F[c]) ||
        c
      );
    },
    ml = () => {
      if (!("speechSynthesis" in window)) {
        Te(f("Text-to-speech is not supported in this browser."));
        return;
      }
      window.speechSynthesis.cancel();
      const c =
          je === "hi"
            ? "पहाड़ के दूरस्थ क्षेत्रों के लिए पहाड़ केयर। आपकी सेहत, आपके करीब।"
            : je === "gar" || je === "kum"
              ? "PahaadCare. Pahad ma sehat ki jaankari, aapka saath."
              : je === "him"
                ? "PahaadCare. Sehat di jaankari, tuhade naal."
                : "PahaadCare. Care that reaches you. Your health, closer to home.",
        C = new SpeechSynthesisUtterance(c);
      ((C.lang = je === "en" ? "en-IN" : "hi-IN"),
        (C.rate = 0.88),
        window.speechSynthesis.speak(C),
        Be(
          f(
            "Using the closest available device voice. Local dialect pronunciation may vary.",
          ),
        ));
    },
    [ue, Cn] = _.useState(() => wt("pc-patient", Ff)),
    [Le, Dt] = _.useState(() => wt("pc-meds", Uf)),
    [Pr, en] = _.useState(""),
    [mm, setMm] = _.useState(false),
    [En, It] = _.useState(false),
    [Sp, setSp] = _.useState(true),
    [Ml, setMl] = _.useState(""),
    [Gp, setGp] = _.useState(null),
    [Fc, setFc] = _.useState([]),
    [Fn, setFn] = _.useState(""),
    [Fp, setFp] = _.useState(""),
    [Gm, setGm] = _.useState(""),
    [vl, tn] = _.useState(false),
    [yl, qn] = _.useState(""),
    [Pn, Gn] = _.useState(null),
    [Nt, Jn] = _.useState(navigator.onLine),
    [nn, Bt] = _.useState("Saved on this device");
  (_.useEffect(() => {
    const c = () => Jn(true),
      C = () => Jn(false);
    (window.addEventListener("online", c),
      window.addEventListener("offline", C));
    const F = (G) => {
      (G.preventDefault(), Gn(G));
    };
    return (
      window.addEventListener("beforeinstallprompt", F),
      () => {
        (window.removeEventListener("online", c),
          window.removeEventListener("offline", C),
          window.removeEventListener("beforeinstallprompt", F));
      }
    );
  }, []),
    _.useEffect(() => {
      (localStorage.setItem("pc-patient", JSON.stringify(ue)),
        Bt("Saved on this device"));
    }, [ue]),
    _.useEffect(() => {
      (localStorage.setItem("pc-meds", JSON.stringify(Le)),
        Bt("Saved on this device"));
    }, [Le]),
    _.useEffect(() => {
      localStorage.setItem("pc-patient-id", JSON.stringify(O));
    }, [O]),
    _.useEffect(() => {
      localStorage.setItem("pc-family-code", JSON.stringify(re));
    }, [re]),
    _.useEffect(() => {
      try {
        localStorage.setItem("pc-reports", JSON.stringify(V));
      } catch {}
    }, [V]),
    _.useEffect(() => {
      try {
        localStorage.setItem("pc-dose-logs", JSON.stringify(Z));
      } catch {}
    }, [Z]),
    _.useEffect(() => {
      const t = window.setTimeout(() => setSp(false), 2200);
      return () => clearTimeout(t);
    }, []),
    _.useEffect(() => {
      se && pcLocate();
    }, [se]),
    _.useEffect(() => {
      setFc(wt("pc-fc-" + h, []));
    }, [h]));
  const zr = Le.filter((c) => c.taken).length,
    Mr = Vf.filter((c) =>
      `${c.name} ${f(c.area)}`.toLowerCase().includes(Pr.toLowerCase()),
    );
  function Te(c) {
    (qn(f(c)), window.setTimeout(() => qn(""), 2800));
  }
  async function gl() {
    if (!Pn) {
      Te(
        f(
          "On Android Chrome, open the menu and choose “Install app” or “Add to Home screen”.",
        ),
      );
      return;
    }
    (Pn.prompt(), await Pn.userChoice, Gn(null));
  }
  function _r(c) {
    const C = Le.find((ye) => ye.id === c);
    if (!C) return;
    const F = !C.taken;
    Dt((ye) =>
      ye.map((ct) =>
        ct.id === c
          ? {
              ...ct,
              taken: F,
              remaining: F
                ? Math.max(0, (ct.remaining ?? 0) - 1)
                : (ct.remaining ?? 0),
            }
          : ct,
      ),
    );
    const G = {
      id: `${Date.now()}-${c}`,
      medicineId: c,
      medicineName: C.name,
      status: F ? "taken" : "missed",
      date: /* @__PURE__ */ new Date().toLocaleDateString(),
      time: /* @__PURE__ */ new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    (le((ye) => [G, ...ye].slice(0, 100)),
      Te(f("Medicine log updated on this device.")));
  }
  async function Rr(c) {
    c.preventDefault();
    const C = te.trim().toUpperCase();
    if (!C || C !== O.toUpperCase()) {
      Te(
        "Demo limitation: this browser can only store a report for the current demo patient ID.",
      );
      return;
    }
    if (g && g.size > 2e6) {
      Te("File too big (max 2 MB).");
      return;
    }
    const F = g ? await $f(g) : void 0,
      G = {
        id: `R-${Date.now().toString(36).toUpperCase()}`,
        patientId: O,
        title: q.trim(),
        doctor: Ee.trim(),
        date: /* @__PURE__ */ new Date().toLocaleDateString(),
        notes: Me.trim(),
        createdAt: /* @__PURE__ */ new Date().toISOString(),
        member: z,
        file: F,
      };
    (fe((ye) => [G, ...ye]),
      ze(""),
      Qe(""),
      De(""),
      W(null),
      ee((ye) => ye + 1),
      Te("Report saved for this patient on this device."));
  }
  function xl(c) {
    c.preventDefault();
    const C = X.trim().toUpperCase() === O.toUpperCase() && Ce === re;
    (B(C),
      C ||
        Te(
          "Patient ID or family access code did not match this demo profile.",
        ));
  }
  const mlf = MedList.filter((m) =>
    (m.name + " " + m.use).toLowerCase().includes(Ml.trim().toLowerCase()),
  );
  // ----- GPS: get phone location (high accuracy first, then network fallback) -----
  function pcLocate() {
    return new Promise((ok) => {
      if (!navigator.geolocation) {
        setGm("This browser does not support GPS.");
        ok(null);
        return;
      }
      if (window.isSecureContext === false) {
        setGm(
          "GPS needs a secure (https) page. Open the app from its https link.",
        );
        ok(null);
        return;
      }
      setGm("Finding your location…");
      let dn = false;
      const fin = (g2, m) => {
          if (dn) return;
          dn = true;
          clearTimeout(tm);
          g2 ? (setGp(g2), setGm("")) : setGm(m);
          ok(g2);
        },
        tm = setTimeout(
          () =>
            fin(
              null,
              "Location timed out. Move to an open area and try again.",
            ),
          25e3,
        ),
        good = (q2) =>
          fin(
            {
              lat: q2.coords.latitude,
              lon: q2.coords.longitude,
              acc: Math.round(q2.coords.accuracy),
              ts: Date.now(),
            },
            "",
          ),
        bad = (e) =>
          fin(
            null,
            e.code === 1
              ? location.protocol === "https:" ||
                /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
                ? "Location permission is blocked. Allow Location for this site in browser settings."
                : "This page was opened as a file, so the browser blocks GPS. Put the app on an https link and open that link in Chrome."
              : e.code === 2
                ? "Turn on your phone GPS/Location and try again."
                : e.code === 3
                  ? "Location timed out. Move to an open area and try again."
                  : "Location not available.",
          );
      navigator.geolocation.getCurrentPosition(
        good,
        (e) => {
          if (e.code === 1) {
            bad(e);
            return;
          }
          if (dn) return;
          navigator.geolocation.getCurrentPosition(good, bad, {
            enableHighAccuracy: false,
            timeout: 12e3,
            maximumAge: 6e4,
          });
        },
        { enableHighAccuracy: true, timeout: 8e3, maximumAge: 3e4 },
      );
    });
  }
  function pcMap(g2) {
    return `https://www.google.com/maps?q=${g2.lat},${g2.lon}`;
  }
  function pcMapQ(q2) {
    return `https://www.google.com/maps/search/${encodeURIComponent(q2)}/@${Gp.lat},${Gp.lon},14z`;
  }
  function pcMsg() {
    return `🚨 EMERGENCY - I need help.
Name: ${ue.name}${ue.bloodGroup && localStorage.getItem("pc-bg-ok-" + h) === "1" ? "\nBlood group: " + ue.bloodGroup : ""}${Gp ? "\nMy location: " + pcMap(Gp) + " (accuracy ±" + Gp.acc + " m)" : "\n(Location not available)"}`;
  }
  function pcCopy() {
    const t = pcMsg();
    navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(t).then(
          () => Te("Location link copied."),
          () => Te("Could not copy."),
        )
      : Te("Could not copy.");
  }
  function pcSort(a) {
    return Gp
      ? [...a].sort(
          (x, y) =>
            (PCXY[x.name] ? pcD(Gp, PCXY[x.name]) : 1e9) -
            (PCXY[y.name] ? pcD(Gp, PCXY[y.name]) : 1e9),
        )
      : a;
  }
  // ----- "Near me" panel (used in Find Care + Pharmacies pages) -----
  function pcNear() {
    return i.jsxs("div", {
      className: "panel near-panel",
      children: [
        i.jsxs("div", {
          className: "near-top",
          children: [
            i.jsx(Ei, { size: 22 }),
            i.jsxs("div", {
              className: "near-text",
              children: [
                i.jsx("h3", { children: f("Near me") }),
                i.jsx("p", {
                  children: Gp
                    ? f("Location found") + " · ±" + Gp.acc + " m"
                    : f(
                        "Use your phone GPS to find care and medicine shops around you.",
                      ),
                }),
              ],
            }),
            i.jsx("button", {
              className: "button button-primary",
              onClick: () => pcLocate(),
              children: f(Gp ? "Refresh location" : "Use my location"),
            }),
          ],
        }),
        Gm && i.jsx("p", { className: "gps-msg", children: f(Gm) }),
        Gp &&
          i.jsxs("div", {
            className: "near-links",
            children: [
              i.jsx("a", {
                className: "button button-secondary",
                href: pcMapQ("hospital"),
                target: "_blank",
                rel: "noopener",
                children: f("Hospitals near me"),
              }),
              i.jsx("a", {
                className: "button button-secondary",
                href: pcMapQ("pharmacy"),
                target: "_blank",
                rel: "noopener",
                children: f("Pharmacies near me"),
              }),
              i.jsx("a", {
                className: "button button-secondary",
                href: pcMapQ("doctor clinic"),
                target: "_blank",
                rel: "noopener",
                children: f("Doctors and clinics near me"),
              }),
            ],
          }),
      ],
    });
  }
  function pcNum(n) {
    const d = String(n).replace(/\D/g, "");
    return d.length === 10
      ? "91" + d
      : d.length === 11 && d[0] === "0"
        ? "91" + d.slice(1)
        : d;
  }
  function pcSaveFc(l) {
    setFc(l);
    try {
      localStorage.setItem("pc-fc-" + h, JSON.stringify(l));
    } catch {}
  }
  function pcAddFc() {
    const nm = Fn.trim(),
      d = Fp.replace(/\D/g, "");
    if (!nm || d.length < 10 || d.length > 13) {
      Te("Enter a name and a valid phone number.");
      return;
    }
    pcSaveFc([
      ...Fc,
      { id: Date.now().toString(36), name: nm, phone: Fp.trim() },
    ]);
    setFn("");
    setFp("");
    Te("Contact saved on this device.");
  }
  // ----- Edit profile: emergency family contacts (max 3) -----
  function pcFamEdit() {
    const ent = (c) => {
      c.key === "Enter" && (c.preventDefault(), pcAddFc());
    };
    return i.jsxs("div", {
      className: "report-upload",
      children: [
        i.jsx("h3", { children: f("Emergency contacts") }),
        i.jsx("small", {
          className: "upload-hint",
          children: f(
            "Saved on this device only. Used in SOS to send your location.",
          ),
        }),
        Fc.map((c) =>
          i.jsxs(
            "div",
            {
              className: "report-item",
              children: [
                i.jsxs("span", {
                  className: "report-name",
                  children: [
                    i.jsx("strong", { children: c.name }),
                    i.jsx("small", { children: c.phone }),
                  ],
                }),
                i.jsx("button", {
                  type: "button",
                  className: "icon-button",
                  "aria-label": "Remove",
                  onClick: () => pcSaveFc(Fc.filter((x) => x.id !== c.id)),
                  children: i.jsx(dc, { size: 16 }),
                }),
              ],
            },
            c.id,
          ),
        ),
        Fc.length < 3
          ? i.jsxs("div", {
              className: "fam-add",
              children: [
                i.jsx("input", {
                  className: "med-search",
                  value: Fn,
                  onChange: (c) => setFn(c.target.value),
                  onKeyDown: ent,
                  placeholder: f("Name"),
                }),
                i.jsx("input", {
                  className: "med-search",
                  type: "tel",
                  inputMode: "tel",
                  value: Fp,
                  onChange: (c) => setFp(c.target.value),
                  onKeyDown: ent,
                  placeholder: f("Phone number"),
                }),
                i.jsxs("button", {
                  type: "button",
                  className: "button button-secondary",
                  onClick: pcAddFc,
                  children: [i.jsx(hl, { size: 16 }), " ", f("Add contact")],
                }),
              ],
            })
          : i.jsx("small", {
              className: "upload-hint",
              children: f("Maximum 3 contacts."),
            }),
      ],
    });
  }
  // ----- SOS: send message + location to family (WhatsApp / SMS / Call) -----
  function pcFam() {
    return i.jsxs("div", {
      className: "fam-box",
      children: [
        i.jsx("strong", { children: f("Family contacts") }),
        !Gp &&
          Fc.length > 0 &&
          i.jsxs("div", {
            className: "gps-msg",
            children: [
              i.jsx("span", {
                children:
                  Gm === "" || Gm === null
                    ? f(
                        "Location is not ready. The message will go without your location.",
                      )
                    : f(
                        "Location is not ready. The message will go without your location.",
                      ),
              }),
              i.jsx("br", {}),
              i.jsx("small", {
                children: f(
                  "Tip: tap Try again, or send your location inside WhatsApp (attach → Location). Open the app in Chrome, not inside another app.",
                ),
              }),
              i.jsx("br", {}),
              i.jsx("button", {
                type: "button",
                className: "button button-secondary",
                onClick: () => pcLocate(),
                children: f("Try again"),
              }),
            ],
          }),
        Fc.length === 0
          ? i.jsxs("div", {
              className: "fam-empty",
              children: [
                i.jsx("span", {
                  children: f(
                    "Add family contacts in Edit profile to send help requests in one tap.",
                  ),
                }),
                i.jsx("button", {
                  className: "button button-secondary",
                  onClick: () => {
                    (ce(false), It(true));
                  },
                  children: f("Add contacts"),
                }),
              ],
            })
          : Fc.map((c) =>
              i.jsxs(
                "div",
                {
                  className: "fam-row",
                  children: [
                    i.jsxs("span", {
                      className: "fam-name",
                      children: [
                        i.jsx("b", { children: c.name }),
                        i.jsx("small", { children: c.phone }),
                      ],
                    }),
                    i.jsx("a", {
                      className: "button button-primary",
                      href:
                        "https://wa.me/" +
                        pcNum(c.phone) +
                        "?text=" +
                        encodeURIComponent(pcMsg()),
                      target: "_blank",
                      rel: "noopener",
                      children: "WhatsApp",
                    }),
                    i.jsx("a", {
                      className: "button button-secondary",
                      href:
                        "sms:+" +
                        pcNum(c.phone) +
                        "?&body=" +
                        encodeURIComponent(pcMsg()),
                      children: "SMS",
                    }),
                    i.jsx("a", {
                      className: "button button-secondary",
                      href: "tel:+" + pcNum(c.phone),
                      children: f("Call"),
                    }),
                  ],
                },
                c.id,
              ),
            ),
      ],
    });
  }
  function pcCompress(f0) {
    return new Promise((ok, no) => {
      const r = new FileReader();
      r.onerror = no;
      r.onload = () => {
        const im = new Image();
        im.onerror = () => $f(f0).then(ok, no);
        im.onload = () => {
          try {
            const m = 1280,
              sc2 = Math.min(1, m / Math.max(im.width, im.height)),
              cv = document.createElement("canvas");
            cv.width = Math.round(im.width * sc2);
            cv.height = Math.round(im.height * sc2);
            cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
            ok({
              name: f0.name,
              type: "image/jpeg",
              data: cv.toDataURL("image/jpeg", 0.75),
            });
          } catch {
            $f(f0).then(ok, no);
          }
        };
        im.src = String(r.result);
      };
      r.readAsDataURL(f0);
    });
  }
  // ----- Edit profile: upload medical report (image or PDF) -----
  async function pcUpload(c) {
    const e = c.target,
      fl0 = e.files && e.files[0];
    if (!fl0) return;
    try {
      let d;
      if (fl0.type.startsWith("image/")) d = await pcCompress(fl0);
      else if (fl0.type === "application/pdf" || /\.pdf$/i.test(fl0.name)) {
        if (fl0.size > 1e6) {
          Te("PDF is too big (max 1 MB).");
          e.value = "";
          return;
        }
        d = await $f(fl0);
      } else {
        Te("Please choose an image or a PDF file.");
        e.value = "";
        return;
      }
      const rp = {
          id: `R-${Date.now().toString(36).toUpperCase()}`,
          patientId: O,
          title: fl0.name.replace(/\.[^.]+$/, ""),
          doctor: "",
          date: /* @__PURE__ */ new Date().toLocaleDateString(),
          notes: "",
          createdAt: /* @__PURE__ */ new Date().toISOString(),
          member: "self",
          source: "patient-upload",
          file: d,
        },
        nx = [rp, ...V];
      if (JSON.stringify(nx).length * 2 > 42e5) {
        Te("Storage is full. Remove an old report first.");
        e.value = "";
        return;
      }
      fe(nx);
      Te("Report uploaded and saved on this device.");
    } catch {
      Te("Could not read this file. Try another one.");
    }
    e.value = "";
  }
  function zn(c) {
    c.preventDefault();
    const C = new FormData(c.currentTarget);
    (Cn({
      name: String(C.get("name") || ue.name),
      village: String(C.get("village") || ue.village),
      bloodGroup: String(C.get("bloodGroup") || ue.bloodGroup),
      allergies: String(C.get("allergies") || ""),
      conditions: String(C.get("conditions") || ""),
    }),
      localStorage.setItem("pc-bg-ok-" + h, "1"),
      It(false),
      Te(f("Profile saved locally.")));
  }
  const Xn = [
    { name: "Overview", icon: zf },
    { name: "RPM Monitor", icon: Nf },
    { name: "My Health", icon: pl },
    { name: "Medicines", icon: wr },
    { name: "Find Care", icon: Pi },
    { name: "Pharmacies", icon: go },
    { name: "Patient Records", icon: Lt },
  ];
  (_.useEffect(() => {
    localStorage.setItem("pc-members", JSON.stringify(ke));
  }, [ke]),
    _.useEffect(() => {
      h &&
        (() => {
          try {
            localStorage.setItem(
              "pc-data-" + h,
              JSON.stringify({
                patient: ue,
                medicines: Le,
                members: ke,
                doseLogs: Z,
                reports: V,
              }),
            );
          } catch {}
        })();
    }, [h, ue, Le, ke, Z, V]),
    _.useEffect(() => {
      const c = window.setInterval(() => {
        const C = /* @__PURE__ */ new Date(),
          F = C.toTimeString().slice(0, 5);
        Le.forEach((G) => {
          const ye = C.toDateString() + F + G.id;
          !G.taken &&
            Bf(G.time) === F &&
            !bt.current.has(ye) &&
            (bt.current.add(ye), Sn(G));
        });
      }, 5e3);
      return () => clearInterval(c);
    }, [Le]),
    _.useEffect(() => {
      if (!kt) return;
      const c = window.setInterval(() => {
        var C;
        try {
          const F = Sr.createOscillator(),
            G = Sr.createGain();
          ((F.frequency.value = 880),
            (G.gain.value = 0.3),
            F.connect(G),
            G.connect(Sr.destination),
            F.start(),
            window.setTimeout(() => F.stop(), 350));
        } catch {}
        (C = navigator.vibrate) == null || C.call(navigator, 300);
      }, 700);
      try {
        "Notification" in window &&
          Notification.permission === "granted" &&
          new Notification("PahaadCare", { body: `${kt.name} · ${kt.time}` });
      } catch {}
      return () => clearInterval(c);
    }, [kt]));
  function $t() {
    try {
      (localStorage.removeItem("pc-auth-user"),
        localStorage.removeItem("pc-role"));
    } catch {}
    (Y(""), at(""), N("Overview"), B(false), It(false));
  }
  function zi(c) {
    if ((c.preventDefault(), !Nn.trim() || !Yn)) return;
    const [C, F] = Yn.split(":"),
      G = +C,
      ye = `${String(G % 12 || 12).padStart(2, "0")}:${F} ${G >= 12 ? "PM" : "AM"}`;
    (Dt((ct) => [
      ...ct,
      {
        id: Date.now(),
        name: Nn.trim(),
        dose: Cr.trim() || "As prescribed",
        time: ye,
        taken: false,
        remaining: 30,
        total: 30,
      },
    ]),
      Nr(""),
      Qn(""),
      Kn(""));
    try {
      Notification.requestPermission();
    } catch {}
    Te("Medicine added. Alarm set.");
  }
  function Mn(c) {
    (c.preventDefault(),
      E.trim() &&
        (me((C) => [...C, { id: "m" + Date.now(), name: E.trim() }]), D("")));
  }
  const _n = (c) => {
    var C;
    return (
      ((C = ke.find((F) => F.id === c)) == null ? void 0 : C.name) || "Self"
    );
  };
  function Zn() {
    pcLocate();
  }
  function ut(c) {
    Be(c);
    try {
      window.speechSynthesis.cancel();
      const C = new SpeechSynthesisUtterance(c);
      ((C.lang = je === "en" ? "en-IN" : "hi-IN"),
        window.speechSynthesis.speak(C));
    } catch {}
  }
  function Mi(c) {
    const C = c.toLowerCase(),
      F = (G) => G.test(C);
    if (F(/sos|emergency|help|मदद|इमरजेंसी/))
      (ce(true), ut("Opening emergency help"));
    else if (F(/pharmac|chemist|दुकान/))
      (en(c.replace(/pharmacy|pharmacies|दुकान/gi, "").trim()),
        N("Pharmacies"),
        ut("Showing pharmacies"));
    else if (F(/medicine|dawa|दवा|दवाई/)) {
      const G = Le.find((ye) => !ye.taken);
      (N("Medicines"),
        ut(
          G
            ? `Your next medicine is ${G.name} at ${G.time}. You have ${Le.length} medicines.`
            : "All medicines are marked as taken.",
        ));
    } else
      F(/report|रिपोर्ट/)
        ? (N("Patient Records"), ut(`You have ${V.length} reports.`))
        : F(/code|id|कोड|आईडी/)
          ? ut(`Your patient ID is ${O}`)
          : F(/family|परिवार/)
            ? ut(`Family members: ${ke.map((G) => G.name).join(", ")}`)
            : F(/health|सेहत/)
              ? (N("My Health"),
                ut(
                  `Blood group ${ue.bloodGroup}. Allergies: ${ue.allergies || "none"}.`,
                ))
              : F(/name|naam|नाम/)
                ? ut(`Your name is ${ue.name}`)
                : ut(
                    "You can ask about next medicine, reports, patient ID, family, pharmacies, or say emergency.",
                  );
  }
  function _i() {
    const c = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!c) {
      Te("Speech input is not supported in this browser. Try current Chrome.");
      return;
    }
    const C = new c();
    ((C.lang = je === "en" ? "en-IN" : "hi-IN"),
      (C.onresult = (F) => {
        var G, ye, ct;
        return Mi(
          ((ct =
            (ye = (G = F.results) == null ? void 0 : G[0]) == null
              ? void 0
              : ye[0]) == null
            ? void 0
            : ct.transcript) || "",
        );
      }),
      (C.onerror = () =>
        Te("Could not recognize speech. Try again or type your search.")),
      C.start());
  }
  return Sp
    ? i.jsxs("div", {
        className: "ob-screen splash-screen",
        children: [
          i.jsx(jo, {}),
          i.jsx("h1", { children: "PahaadCare" }),
          i.jsx("p", { children: f("Care for the hills") }),
        ],
      })
    : ot
      ? h
        ? i.jsxs("div", {
            className: "app-shell",
            children: [
              i.jsxs("aside", {
                className: "sidebar",
                children: [
                  i.jsxs("button", {
                    className: "brand",
                    onClick: () => N("Overview"),
                    "aria-label": "PahaadCare home",
                    children: [
                      i.jsx("span", {
                        className: "brand-mark",
                        children: i.jsx(kr, { size: 22 }),
                      }),
                      i.jsxs("span", {
                        children: [
                          i.jsx("strong", { children: "PahaadCare" }),
                          i.jsx("small", {
                            children: f("CARE THAT REACHES YOU"),
                          }),
                        ],
                      }),
                    ],
                  }),
                  i.jsx("div", {
                    className: "side-label",
                    children: f("WORKSPACE"),
                  }),
                  i.jsx("nav", {
                    className: "nav-list",
                    children: Xn.map((c) => {
                      const C = c.icon;
                      return i.jsxs(
                        "button",
                        {
                          className: `nav-item ${k === c.name ? "active" : ""}`,
                          onClick: () => N(c.name),
                          children: [
                            i.jsx(C, { size: 18 }),
                            i.jsx("span", { children: f(c.name) }),
                            c.name === "Medicines" &&
                              i.jsx("span", {
                                className: "nav-count",
                                children: Le.length,
                              }),
                          ],
                        },
                        c.name,
                      );
                    }),
                  }),
                  i.jsxs("div", {
                    className: "sidebar-bottom",
                    children: [
                      i.jsxs("button", {
                        className: "nav-item logout-item",
                        onClick: $t,
                        children: [
                          i.jsx(xo, { size: 18 }),
                          i.jsx("span", { children: f("Log out") }),
                        ],
                      }),
                      i.jsxs("div", {
                        className: "offline-card",
                        children: [
                          i.jsx("div", {
                            className: `status-dot ${Nt ? "connected" : ""}`,
                          }),
                          i.jsxs("div", {
                            children: [
                              i.jsx("strong", {
                                children: f(
                                  Nt
                                    ? "You’re connected"
                                    : "Offline mode active",
                                ),
                              }),
                              i.jsx("span", {
                                children: f(
                                  Nt
                                    ? "Local data is available"
                                    : "Saved health data is available",
                                ),
                              }),
                            ],
                          }),
                        ],
                      }),
                      i.jsxs("button", {
                        className: "nav-item",
                        onClick: () => It(true),
                        children: [
                          i.jsx(uc, { size: 18 }),
                          i.jsx("span", { children: f("Profile settings") }),
                        ],
                      }),
                      i.jsxs("div", {
                        className: "sidebar-note",
                        children: [
                          i.jsx(Lt, { size: 15 }),
                          " ",
                          f("Your health. Your control."),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              i.jsxs("main", {
                className: "main-area",
                children: [
                  i.jsxs("header", {
                    className: "topbar",
                    children: [
                      i.jsxs("div", {
                        className: "mobile-brand",
                        children: [
                          i.jsx("button", {
                            className: "icon-button menu-btn",
                            "aria-label": "Menu",
                            onClick: () => setMm(true),
                            children: i.jsxs("svg", {
                              width: 20,
                              height: 20,
                              viewBox: "0 0 24 24",
                              fill: "none",
                              stroke: "currentColor",
                              strokeWidth: 2.4,
                              strokeLinecap: "round",
                              children: [
                                i.jsx("path", { d: "M4 6h16" }),
                                i.jsx("path", { d: "M4 12h16" }),
                                i.jsx("path", { d: "M4 18h16" }),
                              ],
                            }),
                          }),
                          i.jsx("span", {
                            className: "brand-mark",
                            children: i.jsx(kr, { size: 19 }),
                          }),
                          i.jsx("strong", { children: "PahaadCare" }),
                        ],
                      }),
                      i.jsxs("div", {
                        className: "breadcrumb",
                        children: [
                          i.jsx("span", { children: f("WORKSPACE") }),
                          i.jsx(oc, { size: 14 }),
                          i.jsx("strong", { children: f(k) }),
                        ],
                      }),
                      i.jsxs("div", {
                        className: "top-actions",
                        children: [
                          i.jsxs("label", {
                            className: "language-picker",
                            "aria-label": f("Choose language"),
                            children: [
                              i.jsx(Wf, {}),
                              i.jsxs("select", {
                                value: je,
                                onChange: (c) => {
                                  (Ot(c.target.value),
                                    localStorage.setItem(
                                      "pc-language",
                                      JSON.stringify(c.target.value),
                                    ),
                                    Be(""));
                                },
                                children: [
                                  i.jsx("option", {
                                    value: "en",
                                    children:
                                      je === "en" ? "English" : f("English"),
                                  }),
                                  i.jsx("option", {
                                    value: "hi",
                                    children: "हिन्दी",
                                  }),
                                  i.jsx("option", {
                                    value: "gar",
                                    children: "गढ़वाली",
                                  }),
                                  i.jsx("option", {
                                    value: "kum",
                                    children: "कुमाऊँनी",
                                  }),
                                  i.jsx("option", {
                                    value: "him",
                                    children: "हिमाचली पहाड़ी",
                                  }),
                                ],
                              }),
                            ],
                          }),
                          i.jsx("button", {
                            className: "icon-button voice-control",
                            title: f("Read welcome aloud"),
                            onClick: ml,
                            children: i.jsx(cc, { size: 17 }),
                          }),
                          i.jsx("button", {
                            className: "icon-button voice-control",
                            title: "Voice assistant",
                            onClick: _i,
                            children: i.jsx(_f, { size: 17 }),
                          }),
                          i.jsxs("button", {
                            className: "icon-button",
                            title: f("Notifications"),
                            onClick: () => Te(f("You’re all caught up.")),
                            children: [i.jsx(sc, { size: 18 }), i.jsx("i", {})],
                          }),
                          i.jsxs("button", {
                            className: "profile-button",
                            onClick: () => It(true),
                            children: [
                              i.jsx("span", {
                                className: "avatar",
                                children: "AR",
                              }),
                              i.jsx("span", {
                                className: "profile-name",
                                children: ue.name,
                              }),
                              i.jsx(oc, { size: 15 }),
                            ],
                          }),
                          i.jsx("button", {
                            className: "sos-btn",
                            onClick: () => {
                              (Zt(""), ce(true));
                            },
                            children: "SOS",
                          }),
                        ],
                      }),
                    ],
                  }),
                  st &&
                    i.jsxs("div", {
                      className: "offline-banner",
                      children: [
                        i.jsx(cc, { size: 16 }),
                        i.jsx("span", { children: st }),
                      ],
                    }),
                  !Nt &&
                    i.jsxs("div", {
                      className: "offline-banner",
                      children: [
                        i.jsx(Pf, { size: 17 }),
                        i.jsxs("span", {
                          children: [
                            i.jsx("strong", { children: f("You’re offline.") }),
                            " ",
                            f(
                              "Your saved health details and medicine log remain available on this device.",
                            ),
                          ],
                        }),
                      ],
                    }),
                  k === "Overview" &&
                    i.jsxs("section", {
                      className: "page-content",
                      children: [
                        i.jsxs("div", {
                          className: "welcome-row",
                          children: [
                            i.jsxs("div", {
                              children: [
                                i.jsxs("div", {
                                  className: "eyebrow",
                                  children: [
                                    i.jsx("span", {
                                      className: "eyebrow-line",
                                    }),
                                    " ",
                                    f("YOUR HEALTH, CLOSER TO HOME"),
                                  ],
                                }),
                                i.jsxs("h1", {
                                  children: [
                                    f("Good morning,"),
                                    " ",
                                    ue.name.split(" ")[0],
                                    " ",
                                    i.jsx("span", { children: "✳" }),
                                  ],
                                }),
                                i.jsx("p", {
                                  className: "subheading",
                                  children: f(
                                    "A little more peace of mind, wherever you are.",
                                  ),
                                }),
                              ],
                            }),
                            i.jsxs("button", {
                              className: "button button-secondary",
                              onClick: gl,
                              children: [
                                i.jsx(hl, { size: 17 }),
                                " ",
                                f("Install app"),
                              ],
                            }),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "hero-card",
                          children: [
                            i.jsxs("div", {
                              className: "hero-copy",
                              children: [
                                i.jsxs("div", {
                                  className: "hero-chip",
                                  children: [
                                    i.jsx(kr, { size: 14 }),
                                    " ",
                                    f("YOUR PERSONAL HEALTH SPACE"),
                                  ],
                                }),
                                i.jsxs("h2", {
                                  children: [
                                    f("Care should travel"),
                                    i.jsx("br", {}),
                                    i.jsx("em", {
                                      children: f("the extra mile."),
                                    }),
                                  ],
                                }),
                                i.jsx("p", {
                                  children: f(
                                    "Keep your essential health details close, track your medicine routine, and find care options around you.",
                                  ),
                                }),
                                i.jsxs("button", {
                                  className: "button button-light",
                                  onClick: () => N("My Health"),
                                  children: [
                                    f("View my health passport"),
                                    " ",
                                    i.jsx(Tt, { size: 16 }),
                                  ],
                                }),
                              ],
                            }),
                            i.jsxs("div", {
                              className: "hero-art",
                              "aria-hidden": "true",
                              children: [
                                i.jsx("div", { className: "sun" }),
                                i.jsxs("svg", {
                                  viewBox: "0 0 360 260",
                                  role: "img",
                                  children: [
                                    i.jsx("path", {
                                      d: "M0 210 87 67l52 77 45-112 103 148 35-54 38 84v50H0Z",
                                      fill: "#9fcbb4",
                                      opacity: ".65",
                                    }),
                                    i.jsx("path", {
                                      d: "m87 67 26 38-21-7-12 18 7-49Zm97-35 28 45-25-8-15 18 12-55Z",
                                      fill: "#f7fbf6",
                                    }),
                                    i.jsx("path", {
                                      d: "M0 220 93 128l53 53 69-84 145 123v40H0Z",
                                      fill: "#4e927a",
                                    }),
                                    i.jsx("path", {
                                      d: "M0 241 91 190l52 24 69-37 148 49v34H0Z",
                                      fill: "#246650",
                                    }),
                                    i.jsx("path", {
                                      d: "M220 120v76",
                                      stroke: "#e5b47e",
                                      strokeWidth: "7",
                                      strokeLinecap: "round",
                                    }),
                                    i.jsx("path", {
                                      d: "M220 131h-28m28 0h28",
                                      stroke: "#e5b47e",
                                      strokeWidth: "7",
                                      strokeLinecap: "round",
                                    }),
                                    i.jsx("path", {
                                      d: "M205 196h30l-5 21h-20Z",
                                      fill: "#e5b47e",
                                    }),
                                    i.jsx("circle", {
                                      cx: "220",
                                      cy: "119",
                                      r: "20",
                                      fill: "#fff6e7",
                                      stroke: "#e5b47e",
                                      strokeWidth: "5",
                                    }),
                                    i.jsx("path", {
                                      d: "M211 119h18m-9-9v18",
                                      stroke: "#246650",
                                      strokeWidth: "4",
                                      strokeLinecap: "round",
                                    }),
                                  ],
                                }),
                                i.jsxs("div", {
                                  className: "floating-note",
                                  children: [
                                    i.jsx("span", {
                                      className: "floating-icon",
                                      children: i.jsx(Lt, { size: 18 }),
                                    }),
                                    i.jsxs("span", {
                                      children: [
                                        i.jsx("strong", {
                                          children: f("Health passport"),
                                        }),
                                        i.jsx("small", {
                                          children: f(
                                            "Available on this device",
                                          ),
                                        }),
                                      ],
                                    }),
                                    i.jsx(yo, {
                                      size: 17,
                                      className: "check-green",
                                    }),
                                  ],
                                }),
                              ],
                            }),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "section-heading",
                          children: [
                            i.jsxs("div", {
                              children: [
                                i.jsx("h2", {
                                  children: f("Your health at a glance"),
                                }),
                                i.jsx("p", {
                                  children: f(
                                    "Simple tools for your everyday care.",
                                  ),
                                }),
                              ],
                            }),
                            i.jsxs("span", {
                              className: "saved-label",
                              children: [i.jsx(fl, { size: 14 }), f(nn)],
                            }),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "stats-grid",
                          children: [
                            i.jsxs("button", {
                              className: "stat-card",
                              onClick: () => N("My Health"),
                              children: [
                                i.jsx("span", {
                                  className: "stat-icon mint",
                                  children: i.jsx(pl, { size: 19 }),
                                }),
                                i.jsx("span", {
                                  className: "stat-label",
                                  children: f("Health passport"),
                                }),
                                i.jsx("strong", {
                                  className: "stat-value",
                                  children: f("Up to date"),
                                }),
                                i.jsxs("span", {
                                  className: "stat-foot",
                                  children: [
                                    f("Profile & key details"),
                                    " ",
                                    i.jsx(Tt, { size: 14 }),
                                  ],
                                }),
                              ],
                            }),
                            i.jsxs("button", {
                              className: "stat-card",
                              onClick: () => N("Medicines"),
                              children: [
                                i.jsx("span", {
                                  className: "stat-icon peach",
                                  children: i.jsx(wr, { size: 19 }),
                                }),
                                i.jsx("span", {
                                  className: "stat-label",
                                  children: f("Medicine routine"),
                                }),
                                i.jsxs("strong", {
                                  className: "stat-value",
                                  children: [
                                    zr,
                                    " ",
                                    f("of"),
                                    " ",
                                    Le.length,
                                    " ",
                                    f("logged"),
                                  ],
                                }),
                                i.jsxs("span", {
                                  className: "stat-foot",
                                  children: [
                                    f("Today’s sample schedule"),
                                    " ",
                                    i.jsx(Tt, { size: 14 }),
                                  ],
                                }),
                              ],
                            }),
                            i.jsxs("button", {
                              className: "stat-card",
                              onClick: () => N("Find Care"),
                              children: [
                                i.jsx("span", {
                                  className: "stat-icon blue",
                                  children: i.jsx(Pi, { size: 19 }),
                                }),
                                i.jsx("span", {
                                  className: "stat-label",
                                  children: f("Find care"),
                                }),
                                i.jsx("strong", {
                                  className: "stat-value",
                                  children: f("3 care options"),
                                }),
                                i.jsxs("span", {
                                  className: "stat-foot",
                                  children: [
                                    f("Explore directory"),
                                    " ",
                                    i.jsx(Tt, { size: 14 }),
                                  ],
                                }),
                              ],
                            }),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "content-grid",
                          children: [
                            i.jsxs("section", {
                              className: "panel medicine-panel",
                              children: [
                                i.jsxs("div", {
                                  className: "panel-header",
                                  children: [
                                    i.jsxs("div", {
                                      children: [
                                        i.jsx("h3", {
                                          children: f("Medicine schedule"),
                                        }),
                                        i.jsx("p", {
                                          children: f(
                                            "Example schedule · Confirm all doses with your clinician.",
                                          ),
                                        }),
                                      ],
                                    }),
                                    i.jsxs("button", {
                                      className: "text-button",
                                      onClick: () => N("Medicines"),
                                      children: [
                                        f("View all"),
                                        " ",
                                        i.jsx(Tt, { size: 15 }),
                                      ],
                                    }),
                                  ],
                                }),
                                Le.map((c) =>
                                  i.jsxs(
                                    "div",
                                    {
                                      className: "medicine-row",
                                      children: [
                                        i.jsx("div", {
                                          className: "med-icon",
                                          children: i.jsx(wr, { size: 18 }),
                                        }),
                                        i.jsxs("div", {
                                          className: "med-details",
                                          children: [
                                            i.jsx("strong", {
                                              children: f(c.name),
                                            }),
                                            i.jsx("span", {
                                              children: f(c.dose),
                                            }),
                                          ],
                                        }),
                                        i.jsxs("div", {
                                          className: "med-time",
                                          children: [
                                            i.jsx(ac, { size: 13 }),
                                            f(c.time),
                                          ],
                                        }),
                                        i.jsx("button", {
                                          className: `check-button ${c.taken ? "done" : ""}`,
                                          onClick: () => _r(c.id),
                                          title: f(
                                            c.taken
                                              ? "Mark not taken"
                                              : "Log as taken",
                                          ),
                                          children: c.taken
                                            ? i.jsx(fl, { size: 16 })
                                            : i.jsx("span", {}),
                                        }),
                                      ],
                                    },
                                    c.id,
                                  ),
                                ),
                                i.jsxs("div", {
                                  className: "panel-footnote",
                                  children: [
                                    i.jsx(Lt, { size: 14 }),
                                    " ",
                                    f(
                                      "Reminder and log only — not medical advice.",
                                    ),
                                  ],
                                }),
                              ],
                            }),
                            i.jsxs("section", {
                              className: "panel emergency-panel",
                              children: [
                                i.jsxs("div", {
                                  className: "emergency-top",
                                  children: [
                                    i.jsx("span", {
                                      className: "emergency-icon",
                                      children: i.jsx(kr, { size: 20 }),
                                    }),
                                    i.jsx("span", {
                                      className: "mini-label",
                                      children: f("HERE WHEN IT MATTERS"),
                                    }),
                                  ],
                                }),
                                i.jsx("h3", {
                                  children: f("Need urgent help?"),
                                }),
                                i.jsx("p", {
                                  children: f(
                                    "Reach official emergency support by phone. If you are in immediate danger, don’t wait for the app.",
                                  ),
                                }),
                                i.jsxs("a", {
                                  className: "emergency-call",
                                  href: "tel:112",
                                  children: [
                                    i.jsxs("span", {
                                      children: [
                                        i.jsx($n, { size: 17 }),
                                        " ",
                                        f("Call emergency services"),
                                      ],
                                    }),
                                    i.jsx(Tt, { size: 17 }),
                                  ],
                                }),
                                i.jsxs("div", {
                                  className: "emergency-foot",
                                  children: [
                                    i.jsx(Lt, { size: 14 }),
                                    " ",
                                    f(
                                      "A phone or network connection is required.",
                                    ),
                                  ],
                                }),
                              ],
                            }),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "bottom-note",
                          children: [
                            i.jsx("span", {
                              className: "note-icon",
                              children: i.jsx(Nf, { size: 17 }),
                            }),
                            i.jsxs("span", {
                              children: [
                                i.jsx("strong", {
                                  children: f(
                                    "A small step toward connected care.",
                                  ),
                                }),
                                i.jsx("small", {
                                  children: f(
                                    "PahaadCare is a demonstration prototype. Listings and medical entries are sample data, not verified live services.",
                                  ),
                                }),
                              ],
                            }),
                            i.jsxs("button", {
                              onClick: () => N("Find Care"),
                              children: [
                                f("Explore care"),
                                " ",
                                i.jsx(Tt, { size: 15 }),
                              ],
                            }),
                          ],
                        }),
                      ],
                    }),
                  k === "RPM Monitor" && i.jsx(RpmDashboard, {}),
                  k === "My Health" &&
                    i.jsxs("section", {
                      className: "page-content",
                      children: [
                        i.jsxs("div", {
                          className: "page-title-row",
                          children: [
                            i.jsxs("div", {
                              children: [
                                i.jsxs("div", {
                                  className: "eyebrow",
                                  children: [
                                    i.jsx("span", {
                                      className: "eyebrow-line",
                                    }),
                                    " ",
                                    f("YOUR PERSONAL RECORD"),
                                  ],
                                }),
                                i.jsx("h1", {
                                  children: f("My health passport"),
                                }),
                                i.jsx("p", {
                                  className: "subheading",
                                  children: f(
                                    "Essential information, kept close even when the network isn’t.",
                                  ),
                                }),
                              ],
                            }),
                            i.jsxs("button", {
                              className: "button button-primary",
                              onClick: () => It(true),
                              children: [
                                f("Edit profile"),
                                " ",
                                i.jsx(uc, { size: 16 }),
                              ],
                            }),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "health-summary",
                          children: [
                            i.jsx("div", {
                              className: "avatar large",
                              children: "AR",
                            }),
                            i.jsxs("div", {
                              className: "health-summary-main",
                              children: [
                                i.jsx("h2", { children: ue.name }),
                                i.jsxs("span", {
                                  children: [
                                    i.jsx(Ei, { size: 14 }),
                                    ue.village,
                                  ],
                                }),
                                i.jsx("small", {
                                  children: f(
                                    "Sample profile · Stored on this device",
                                  ),
                                }),
                              ],
                            }),
                            i.jsxs("div", {
                              className: "blood-card",
                              children: [
                                i.jsx("small", { children: f("BLOOD GROUP") }),
                                i.jsx("strong", { children: ue.bloodGroup }),
                              ],
                            }),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "health-cards",
                          children: [
                            i.jsxs("div", {
                              className: "panel info-card",
                              children: [
                                i.jsx("span", {
                                  className: "stat-icon peach",
                                  children: i.jsx($n, { size: 19 }),
                                }),
                                i.jsx("h3", { children: f("Known allergies") }),
                                i.jsx("p", {
                                  children: ue.allergies || f("None recorded"),
                                }),
                                i.jsx("small", {
                                  children: f(
                                    "Verify with your healthcare provider.",
                                  ),
                                }),
                              ],
                            }),
                            i.jsxs("div", {
                              className: "panel info-card",
                              children: [
                                i.jsx("span", {
                                  className: "stat-icon mint",
                                  children: i.jsx(kr, { size: 19 }),
                                }),
                                i.jsx("h3", {
                                  children: f("Health conditions"),
                                }),
                                i.jsx("p", {
                                  children: ue.conditions || f("None recorded"),
                                }),
                                i.jsx("small", {
                                  children: f(
                                    "Sample information; not a diagnosis.",
                                  ),
                                }),
                              ],
                            }),
                            i.jsxs("div", {
                              className: "panel info-card",
                              style: { cursor: "pointer" },
                              onClick: () => It(true),
                              children: [
                                i.jsx("span", {
                                  className: "stat-icon blue",
                                  children: i.jsx(pl, { size: 19 }),
                                }),
                                i.jsx("h3", {
                                  children: f("Medical documents"),
                                }),
                                i.jsx("p", {
                                  children: V.length + " " + f("uploaded"),
                                }),
                                i.jsx("small", {
                                  children: f("Add reports from Edit profile."),
                                }),
                              ],
                            }),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "panel",
                          children: [
                            i.jsxs("div", {
                              className: "panel-header",
                              children: [
                                i.jsxs("div", {
                                  children: [
                                    i.jsx("h3", {
                                      children: f(
                                        "Before sharing your records",
                                      ),
                                    }),
                                    i.jsx("p", {
                                      children: f("Privacy first, every time."),
                                    }),
                                  ],
                                }),
                                i.jsx(Lt, {
                                  size: 21,
                                  className: "green-text",
                                }),
                              ],
                            }),
                            i.jsx("p", {
                              className: "body-copy",
                              children: f(
                                "This prototype stores profile details in your current browser on this device. It does not send them to a doctor or cloud server. Do not enter real sensitive health data until authentication, encryption, consent and access controls have been implemented and reviewed.",
                              ),
                            }),
                          ],
                        }),
                      ],
                    }),
                  k === "Medicines" &&
                    i.jsxs("section", {
                      className: "page-content",
                      children: [
                        i.jsxs("div", {
                          className: "page-title-row",
                          children: [
                            i.jsxs("div", {
                              children: [
                                i.jsxs("div", {
                                  className: "eyebrow",
                                  children: [
                                    i.jsx("span", {
                                      className: "eyebrow-line",
                                    }),
                                    " ",
                                    f("YOUR DAILY ROUTINE"),
                                  ],
                                }),
                                i.jsx("h1", {
                                  children: f("Medicine management"),
                                }),
                                i.jsx("p", {
                                  className: "subheading",
                                  children: f(
                                    "Track your schedule and keep a simple local log.",
                                  ),
                                }),
                              ],
                            }),
                            i.jsxs("button", {
                              className: "button button-secondary",
                              onClick: () =>
                                Te(
                                  "For this demo, medicine entries are examples. Ask your clinician before adding a real schedule.",
                                ),
                              children: [
                                i.jsx(hl, { size: 16 }),
                                " ",
                                f("Add medicine"),
                              ],
                            }),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "reminder-banner",
                          children: [
                            i.jsx("div", {
                              className: "reminder-icon",
                              children: i.jsx(sc, { size: 20 }),
                            }),
                            i.jsxs("div", {
                              children: [
                                i.jsx("strong", {
                                  children: f(
                                    "Your schedule stays on this device",
                                  ),
                                }),
                                i.jsx("p", {
                                  children: f(
                                    "Browser reminders may require permission and may not fire reliably when the browser is closed. This demo logs status but does not schedule guaranteed alerts.",
                                  ),
                                }),
                              ],
                            }),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "panel",
                          children: [
                            i.jsxs("div", {
                              className: "panel-header",
                              children: [
                                i.jsxs("div", {
                                  children: [
                                    i.jsx("h3", {
                                      children: f("Today’s schedule"),
                                    }),
                                    i.jsxs("p", {
                                      children: [
                                        zr,
                                        " ",
                                        f("of"),
                                        " ",
                                        Le.length,
                                        " ",
                                        f("items marked as taken."),
                                      ],
                                    }),
                                  ],
                                }),
                                i.jsxs("span", {
                                  className: "date-chip",
                                  children: [
                                    i.jsx(Cf, { size: 14 }),
                                    " ",
                                    f("Today"),
                                  ],
                                }),
                              ],
                            }),
                            Le.map((c) =>
                              i.jsxs(
                                "div",
                                {
                                  className: "medicine-row expanded",
                                  children: [
                                    i.jsx("div", {
                                      className: "med-icon",
                                      children: i.jsx(wr, { size: 18 }),
                                    }),
                                    i.jsxs("div", {
                                      className: "med-details",
                                      children: [
                                        i.jsx("strong", {
                                          children: f(c.name),
                                        }),
                                        i.jsx("span", { children: f(c.dose) }),
                                        i.jsxs("small", {
                                          children: [
                                            i.jsx(ac, { size: 12 }),
                                            f(c.time),
                                          ],
                                        }),
                                      ],
                                    }),
                                    i.jsx("button", {
                                      className: `button ${c.taken ? "button-success" : "button-primary"}`,
                                      onClick: () => _r(c.id),
                                      children: c.taken
                                        ? i.jsxs(i.Fragment, {
                                            children: [
                                              i.jsx(fl, { size: 15 }),
                                              " ",
                                              f("Logged"),
                                            ],
                                          })
                                        : i.jsxs(i.Fragment, {
                                            children: [
                                              f("Mark taken"),
                                              " ",
                                              i.jsx(fl, { size: 15 }),
                                            ],
                                          }),
                                    }),
                                  ],
                                },
                                c.id,
                              ),
                            ),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "panel record-section",
                          children: [
                            i.jsxs("div", {
                              className: "panel-header",
                              children: [
                                i.jsxs("div", {
                                  children: [
                                    i.jsx("h3", {
                                      children: f("Add medicine"),
                                    }),
                                    i.jsx("p", {
                                      children:
                                        "Alarm rings at this time (works offline while the app is open).",
                                    }),
                                  ],
                                }),
                                i.jsx(wr, { size: 20 }),
                              ],
                            }),
                            i.jsxs("form", {
                              className: "record-form",
                              onSubmit: zi,
                              children: [
                                i.jsxs("label", {
                                  children: [
                                    "Medicine name",
                                    i.jsx("input", {
                                      value: Nn,
                                      onChange: (c) => Nr(c.target.value),
                                      required: true,
                                    }),
                                  ],
                                }),
                                i.jsxs("label", {
                                  children: [
                                    "Dose",
                                    i.jsx("input", {
                                      value: Cr,
                                      onChange: (c) => Qn(c.target.value),
                                    }),
                                  ],
                                }),
                                i.jsxs("label", {
                                  children: [
                                    "Time",
                                    i.jsx("input", {
                                      type: "time",
                                      value: Yn,
                                      onChange: (c) => Kn(c.target.value),
                                      required: true,
                                    }),
                                  ],
                                }),
                                i.jsxs("button", {
                                  className: "button button-primary",
                                  type: "submit",
                                  children: [
                                    i.jsx(hl, { size: 16 }),
                                    " ",
                                    f("Add medicine"),
                                  ],
                                }),
                              ],
                            }),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "safety-callout",
                          children: [
                            i.jsx($n, { size: 18 }),
                            i.jsxs("span", {
                              children: [
                                i.jsx("strong", {
                                  children: f("Medication safety:"),
                                }),
                                " ",
                                f(
                                  "Use only the dose and timing prescribed by your licensed clinician. If you miss a dose, don’t double it unless your clinician or medicine instructions say to.",
                                ),
                              ],
                            }),
                          ],
                        }),
                      ],
                    }),
                  k === "Patient Records" &&
                    i.jsxs("section", {
                      className: "page-content",
                      children: [
                        i.jsxs("div", {
                          className: "page-title-row",
                          children: [
                            i.jsxs("div", {
                              children: [
                                i.jsxs("div", {
                                  className: "eyebrow",
                                  children: [
                                    i.jsx("span", {
                                      className: "eyebrow-line",
                                    }),
                                    " PRIVATE HEALTH SPACE",
                                  ],
                                }),
                                i.jsx("h1", { children: f("Patient Records") }),
                                i.jsx("p", {
                                  className: "subheading",
                                  children:
                                    "Patient ID, family access, medicine refill alerts and doctor reports.",
                                }),
                              ],
                            }),
                            i.jsxs("span", {
                              className: "connection-pill",
                              children: [
                                i.jsx(Lt, { size: 14 }),
                                " Demo profile",
                              ],
                            }),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "records-grid",
                          children: [
                            i.jsxs("div", {
                              className: "panel record-id-card",
                              children: [
                                i.jsx("span", {
                                  className: "stat-icon mint",
                                  children: i.jsx(pl, { size: 19 }),
                                }),
                                i.jsx("p", {
                                  className: "record-label",
                                  children: "PATIENT UNIQUE ID",
                                }),
                                i.jsx("h2", { children: O }),
                                i.jsxs("p", {
                                  children: [
                                    "Patient: ",
                                    i.jsx("strong", { children: ue.name }),
                                  ],
                                }),
                                i.jsx("p", {
                                  className: "record-muted",
                                  children:
                                    "This ID identifies this demo profile on this browser only.",
                                }),
                                i.jsx("button", {
                                  className: "button button-secondary",
                                  onClick: () => {
                                    var c;
                                    ((c = navigator.clipboard) == null ||
                                      c.writeText(O),
                                      Te("Patient ID copied."));
                                  },
                                  children: "Copy patient ID",
                                }),
                              ],
                            }),
                            i.jsxs("div", {
                              className: "panel",
                              children: [
                                i.jsxs("div", {
                                  className: "panel-header",
                                  children: [
                                    i.jsxs("div", {
                                      children: [
                                        i.jsx("h3", {
                                          children: "Family access code",
                                        }),
                                        i.jsx("p", {
                                          children:
                                            "Share this code only with trusted family/caregivers.",
                                        }),
                                      ],
                                    }),
                                    i.jsx(Lt, { size: 20 }),
                                  ],
                                }),
                                i.jsxs("label", {
                                  className: "record-field",
                                  children: [
                                    "Set 4–8 digit code",
                                    i.jsx("input", {
                                      value: re,
                                      onChange: (c) =>
                                        pe(
                                          c.target.value
                                            .replace(/\D/g, "")
                                            .slice(0, 8),
                                        ),
                                      minLength: 4,
                                      maxLength: 8,
                                      inputMode: "numeric",
                                    }),
                                  ],
                                }),
                                i.jsx("p", {
                                  className: "record-muted",
                                  children:
                                    "Demo default code is 4826. Change it before testing. This is not a secure login system.",
                                }),
                              ],
                            }),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "panel record-section",
                          children: [
                            i.jsxs("div", {
                              className: "panel-header",
                              children: [
                                i.jsxs("div", {
                                  children: [
                                    i.jsx("h3", {
                                      children: "Medicine refill alerts",
                                    }),
                                    i.jsx("p", {
                                      children:
                                        "Stock estimate based on manually entered demo quantities.",
                                    }),
                                  ],
                                }),
                                i.jsx(wr, { size: 20 }),
                              ],
                            }),
                            Le.map((c) =>
                              i.jsxs(
                                "div",
                                {
                                  className: "record-medicine",
                                  children: [
                                    i.jsxs("div", {
                                      children: [
                                        i.jsx("strong", {
                                          children: f(c.name),
                                        }),
                                        i.jsx("small", { children: f(c.dose) }),
                                      ],
                                    }),
                                    i.jsxs("div", {
                                      className: "stock-meter",
                                      children: [
                                        i.jsxs("strong", {
                                          children: [c.remaining ?? 0, " left"],
                                        }),
                                        i.jsx("span", {
                                          className:
                                            (c.remaining ?? 0) <= 5
                                              ? "stock-low"
                                              : "stock-ok",
                                          children:
                                            (c.remaining ?? 0) <= 5
                                              ? "Refill soon"
                                              : "Stock available",
                                        }),
                                      ],
                                    }),
                                    i.jsx("input", {
                                      "aria-label": `Remaining stock for ${c.name}`,
                                      type: "number",
                                      min: "0",
                                      max: "999",
                                      value: c.remaining ?? 0,
                                      onChange: (C) =>
                                        Dt((F) =>
                                          F.map((G) =>
                                            G.id === c.id
                                              ? {
                                                  ...G,
                                                  remaining: Number(
                                                    C.target.value,
                                                  ),
                                                }
                                              : G,
                                          ),
                                        ),
                                    }),
                                  ],
                                },
                                c.id,
                              ),
                            ),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "panel record-section",
                          children: [
                            i.jsxs("div", {
                              className: "panel-header",
                              children: [
                                i.jsxs("div", {
                                  children: [
                                    i.jsx("h3", {
                                      children:
                                        "Family / caregiver report view",
                                    }),
                                    i.jsx("p", {
                                      children:
                                        "Enter the patient's ID and their family access code.",
                                    }),
                                  ],
                                }),
                                i.jsx(Lt, { size: 20 }),
                              ],
                            }),
                            i.jsxs("form", {
                              className: "record-form",
                              onSubmit: xl,
                              children: [
                                i.jsxs("label", {
                                  children: [
                                    "Patient ID",
                                    i.jsx("input", {
                                      value: X,
                                      onChange: (c) => he(c.target.value),
                                      placeholder: "e.g. PC-ABC123",
                                      required: true,
                                    }),
                                  ],
                                }),
                                i.jsxs("label", {
                                  children: [
                                    "Family access code",
                                    i.jsx("input", {
                                      value: Ce,
                                      onChange: (c) => Q(c.target.value),
                                      type: "password",
                                      inputMode: "numeric",
                                      required: true,
                                    }),
                                  ],
                                }),
                                i.jsx("button", {
                                  className: "button button-primary",
                                  type: "submit",
                                  children: "Unlock family view",
                                }),
                              ],
                            }),
                            $ &&
                              i.jsxs("div", {
                                className: "family-report",
                                children: [
                                  i.jsxs("h3", {
                                    children: [ue.name, " — Health summary"],
                                  }),
                                  i.jsxs("p", {
                                    children: [
                                      i.jsx("strong", {
                                        children: "Patient ID:",
                                      }),
                                      " ",
                                      O,
                                    ],
                                  }),
                                  i.jsxs("p", {
                                    children: [
                                      i.jsx("strong", {
                                        children: "Blood group:",
                                      }),
                                      " ",
                                      ue.bloodGroup,
                                      " · ",
                                      i.jsx("strong", {
                                        children: "Allergies:",
                                      }),
                                      " ",
                                      ue.allergies || "None recorded",
                                    ],
                                  }),
                                  i.jsxs("p", {
                                    children: [
                                      i.jsx("strong", {
                                        children: "Conditions:",
                                      }),
                                      " ",
                                      ue.conditions || "None recorded",
                                    ],
                                  }),
                                  i.jsx("h4", {
                                    children: "Medicine adherence log",
                                  }),
                                  Z.length
                                    ? Z.slice(0, 10).map((c) =>
                                        i.jsxs(
                                          "p",
                                          {
                                            className: "log-line",
                                            children: [
                                              i.jsx("span", {
                                                children: c.medicineName,
                                              }),
                                              i.jsxs("span", {
                                                children: [
                                                  c.status === "taken"
                                                    ? "Taken"
                                                    : "Marked missed",
                                                  " · ",
                                                  c.date,
                                                  " ",
                                                  c.time,
                                                ],
                                              }),
                                            ],
                                          },
                                          c.id,
                                        ),
                                      )
                                    : i.jsx("p", {
                                        children:
                                          "No medicine activity has been logged yet.",
                                      }),
                                  i.jsxs("h4", {
                                    children: [
                                      "Reports received (",
                                      V.length,
                                      ")",
                                    ],
                                  }),
                                  V.length
                                    ? V.map((c) =>
                                        i.jsxs(
                                          "div",
                                          {
                                            className: "report-item",
                                            children: [
                                              i.jsx("strong", {
                                                children: c.title,
                                              }),
                                              i.jsxs("small", {
                                                children: [
                                                  _n(c.member),
                                                  " · ",
                                                  c.doctor,
                                                  " · ",
                                                  c.date,
                                                ],
                                              }),
                                              i.jsx("p", { children: c.notes }),
                                              c.file &&
                                                i.jsx("button", {
                                                  className:
                                                    "button button-secondary",
                                                  onClick: () => ae(c.file),
                                                  children: f("View"),
                                                }),
                                            ],
                                          },
                                          c.id,
                                        ),
                                      )
                                    : i.jsx("p", {
                                        children:
                                          "No doctor reports have been added.",
                                      }),
                                ],
                              }),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "panel record-section",
                          children: [
                            i.jsxs("div", {
                              className: "panel-header",
                              children: [
                                i.jsxs("div", {
                                  children: [
                                    i.jsx("h3", {
                                      children: f("Family members"),
                                    }),
                                    i.jsx("p", {
                                      children:
                                        "Add family members to keep each person's reports separate.",
                                    }),
                                  ],
                                }),
                                i.jsx(vc, { size: 20 }),
                              ],
                            }),
                            i.jsxs("form", {
                              className: "record-form",
                              onSubmit: Mn,
                              children: [
                                i.jsxs("label", {
                                  children: [
                                    "Name",
                                    i.jsx("input", {
                                      value: E,
                                      onChange: (c) => D(c.target.value),
                                      required: true,
                                    }),
                                  ],
                                }),
                                i.jsxs("button", {
                                  className: "button button-primary",
                                  type: "submit",
                                  children: [i.jsx(hl, { size: 16 }), " Add"],
                                }),
                              ],
                            }),
                            ke.map((c) =>
                              i.jsxs(
                                "p",
                                {
                                  className: "log-line",
                                  children: [
                                    i.jsx("span", { children: c.name }),
                                    i.jsxs("span", {
                                      children: [
                                        V.filter(
                                          (C) => (C.member || "self") === c.id,
                                        ).length,
                                        " reports",
                                      ],
                                    }),
                                  ],
                                },
                                c.id,
                              ),
                            ),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "panel record-section",
                          children: [
                            i.jsxs("div", {
                              className: "panel-header",
                              children: [
                                i.jsxs("div", {
                                  children: [
                                    i.jsx("h3", { children: f("My reports") }),
                                    i.jsx("p", {
                                      children:
                                        "All uploaded reports, grouped by family member.",
                                    }),
                                  ],
                                }),
                                i.jsx(pl, { size: 20 }),
                              ],
                            }),
                            V.map((c) =>
                              i.jsxs(
                                "div",
                                {
                                  className: "report-item",
                                  children: [
                                    i.jsx("strong", { children: c.title }),
                                    i.jsxs("small", {
                                      children: [
                                        _n(c.member),
                                        " · ",
                                        c.doctor,
                                        " · ",
                                        c.date,
                                      ],
                                    }),
                                    i.jsx("p", { children: c.notes }),
                                    i.jsxs("div", {
                                      className: "report-file",
                                      children: [
                                        c.file &&
                                          i.jsx("button", {
                                            className:
                                              "button button-secondary",
                                            onClick: () => ae(c.file),
                                            children: f("View"),
                                          }),
                                        i.jsx("button", {
                                          className: "button button-secondary",
                                          onClick: () =>
                                            fe((C) =>
                                              C.filter((F) => F.id !== c.id),
                                            ),
                                          children: f("Delete"),
                                        }),
                                      ],
                                    }),
                                  ],
                                },
                                c.id,
                              ),
                            ),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "panel record-section",
                          children: [
                            i.jsxs("div", {
                              className: "panel-header",
                              children: [
                                i.jsxs("div", {
                                  children: [
                                    i.jsx("h3", {
                                      children: "Doctor: add / send a report",
                                    }),
                                    i.jsx("p", {
                                      children:
                                        "Demo workflow for a report addressed to a patient ID.",
                                    }),
                                  ],
                                }),
                                i.jsx(Pi, { size: 20 }),
                              ],
                            }),
                            i.jsxs("form", {
                              className: "record-form doctor-form",
                              onSubmit: Rr,
                              children: [
                                i.jsxs("label", {
                                  children: [
                                    "Patient ID",
                                    i.jsx("input", {
                                      value: te,
                                      onChange: (c) => it(c.target.value),
                                      placeholder: O,
                                      required: true,
                                    }),
                                  ],
                                }),
                                i.jsxs("label", {
                                  children: [
                                    "Doctor name",
                                    i.jsx("input", {
                                      value: Ee,
                                      onChange: (c) => Qe(c.target.value),
                                      placeholder: "Dr. name (optional)",
                                    }),
                                  ],
                                }),
                                i.jsxs("label", {
                                  children: [
                                    "Report title",
                                    i.jsx("input", {
                                      value: q,
                                      onChange: (c) => ze(c.target.value),
                                      placeholder: "e.g. Consultation summary",
                                      required: true,
                                    }),
                                  ],
                                }),
                                i.jsxs("label", {
                                  children: [
                                    "Report summary / instructions",
                                    i.jsx("textarea", {
                                      value: Me,
                                      onChange: (c) => De(c.target.value),
                                      rows: 4,
                                      placeholder:
                                        "Enter a summary (optional if you attach a file).",
                                    }),
                                    i.jsxs("label", {
                                      children: [
                                        f("Family members"),
                                        i.jsx("select", {
                                          value: z,
                                          onChange: (c) => p(c.target.value),
                                          children: ke.map((c) =>
                                            i.jsx(
                                              "option",
                                              { value: c.id, children: c.name },
                                              c.id,
                                            ),
                                          ),
                                        }),
                                      ],
                                    }),
                                    i.jsxs("label", {
                                      children: [
                                        f("Attach file"),
                                        " (image / PDF, max 2 MB)",
                                        i.jsx(
                                          "input",
                                          {
                                            type: "file",
                                            accept:
                                              "image/*,.pdf,.doc,.docx,.txt",
                                            onChange: (c) => {
                                              var C;
                                              return W(
                                                ((C = c.target.files) == null
                                                  ? void 0
                                                  : C[0]) || null,
                                              );
                                            },
                                          },
                                          K,
                                        ),
                                      ],
                                    }),
                                  ],
                                }),
                                i.jsxs("button", {
                                  className: "button button-primary",
                                  type: "submit",
                                  children: [
                                    i.jsx(hl, { size: 16 }),
                                    " Save report to patient ID",
                                  ],
                                }),
                              ],
                            }),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "notice-banner record-warning",
                          children: [
                            i.jsx($n, { size: 17 }),
                            i.jsxs("span", {
                              children: [
                                i.jsx("strong", {
                                  children: "Prototype limitation:",
                                }),
                                " data is stored only in this browser. A patient ID alone cannot securely reveal or send real medical records. Real family access and doctor report delivery require a backend database, verified patient/doctor accounts, explicit patient consent, encrypted transport/storage, access logs, and revocation controls. Do not store real medical records in this demo.",
                              ],
                            }),
                          ],
                        }),
                      ],
                    }),
                  k === "Find Care" &&
                    i.jsxs("section", {
                      className: "page-content",
                      children: [
                        i.jsxs("div", {
                          className: "page-title-row",
                          children: [
                            i.jsxs("div", {
                              children: [
                                i.jsxs("div", {
                                  className: "eyebrow",
                                  children: [
                                    i.jsx("span", {
                                      className: "eyebrow-line",
                                    }),
                                    " ",
                                    f("YOUR CARE NETWORK"),
                                  ],
                                }),
                                i.jsx("h1", {
                                  children: f("Find care near you"),
                                }),
                                i.jsx("p", {
                                  className: "subheading",
                                  children: f(
                                    "Explore demo care listings. Please verify details before travelling.",
                                  ),
                                }),
                              ],
                            }),
                            i.jsxs("span", {
                              className: "connection-pill",
                              children: [
                                i.jsx(Ei, { size: 14 }),
                                " ",
                                f("Sample directory"),
                              ],
                            }),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "notice-banner",
                          children: [
                            i.jsx($n, { size: 17 }),
                            i.jsx("span", {
                              children: f(
                                "These are demonstration listings, not verified real providers. No live booking or teleconsultation is connected.",
                              ),
                            }),
                          ],
                        }),
                        pcNear(),
                        i.jsx("div", {
                          className: "provider-list",
                          children: Hf.map((c, C) =>
                            i.jsxs(
                              "div",
                              {
                                className: "panel provider-card",
                                children: [
                                  i.jsx("div", {
                                    className: `provider-avatar ${c.color}`,
                                    children: c.initials,
                                  }),
                                  i.jsxs("div", {
                                    className: "provider-info",
                                    children: [
                                      i.jsx("h3", { children: c.name }),
                                      i.jsx("p", { children: f(c.speciality) }),
                                      i.jsxs("span", {
                                        children: [
                                          i.jsx(yo, { size: 13 }),
                                          f(c.mode),
                                        ],
                                      }),
                                    ],
                                  }),
                                  i.jsxs("button", {
                                    className: "button button-secondary",
                                    onClick: () => tn(true),
                                    children: [
                                      f(
                                        C === 2
                                          ? "View details"
                                          : "Request visit",
                                      ),
                                      " ",
                                      i.jsx(Tt, { size: 15 }),
                                    ],
                                  }),
                                ],
                              },
                              c.name,
                            ),
                          ),
                        }),
                        i.jsxs("div", {
                          className: "panel referral-panel",
                          children: [
                            i.jsx("div", {
                              className: "referral-icon",
                              children: i.jsx(Mf, { size: 20 }),
                            }),
                            i.jsxs("div", {
                              children: [
                                i.jsx("h3", {
                                  children: f("Need a referral?"),
                                }),
                                i.jsx("p", {
                                  children: f(
                                    "In the real service, a verified clinician can create a referral and share it securely with the receiving facility.",
                                  ),
                                }),
                                i.jsxs("button", {
                                  className: "text-button",
                                  onClick: () =>
                                    Te(
                                      "Demo only: referral workflow is not connected to a clinician.",
                                    ),
                                  children: [
                                    f("Explore referral workflow"),
                                    " ",
                                    i.jsx(Tt, { size: 15 }),
                                  ],
                                }),
                              ],
                            }),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "panel med-list-panel",
                          children: [
                            i.jsxs("div", {
                              className: "panel-header",
                              children: [
                                i.jsxs("div", {
                                  children: [
                                    i.jsx("h3", {
                                      children: f(
                                        "Common medicines list (1–90)",
                                      ),
                                    }),
                                    i.jsx("p", {
                                      children: f(
                                        "Medicine names and what they are commonly used for.",
                                      ),
                                    }),
                                  ],
                                }),
                                i.jsx(pl, {
                                  size: 21,
                                  className: "green-text",
                                }),
                              ],
                            }),
                            i.jsx("input", {
                              className: "med-search",
                              type: "search",
                              value: Ml,
                              onChange: (c) => setMl(c.target.value),
                              placeholder: f(
                                "Search medicine or use, e.g. BP, dard",
                              ),
                            }),
                            i.jsx("div", {
                              className: "med-grid",
                              children: mlf.map((m) =>
                                i.jsxs(
                                  "div",
                                  {
                                    className: "med-list-row",
                                    children: [
                                      i.jsx("span", {
                                        className: "med-num",
                                        children: m.n,
                                      }),
                                      i.jsxs("span", {
                                        className: "med-list-text",
                                        children: [
                                          i.jsx("strong", { children: m.name }),
                                          i.jsx("small", { children: m.use }),
                                        ],
                                      }),
                                    ],
                                  },
                                  m.n,
                                ),
                              ),
                            }),
                            mlf.length === 0 &&
                              i.jsx("p", {
                                className: "upload-hint",
                                children: f("No medicine found."),
                              }),
                            i.jsxs("div", {
                              className: "panel-footnote",
                              children: [
                                i.jsx(Lt, { size: 14 }),
                                " ",
                                f(
                                  "For information only. Take any medicine only on your doctor’s advice.",
                                ),
                              ],
                            }),
                          ],
                        }),
                      ],
                    }),
                  k === "Pharmacies" &&
                    i.jsxs("section", {
                      className: "page-content",
                      children: [
                        i.jsxs("div", {
                          className: "page-title-row",
                          children: [
                            i.jsxs("div", {
                              children: [
                                i.jsxs("div", {
                                  className: "eyebrow",
                                  children: [
                                    i.jsx("span", {
                                      className: "eyebrow-line",
                                    }),
                                    " ",
                                    f("LOCAL HEALTH RESOURCES"),
                                  ],
                                }),
                                i.jsx("h1", {
                                  children: f("Pharmacies & centres"),
                                }),
                                i.jsx("p", {
                                  className: "subheading",
                                  children: f(
                                    "Check contact details before making a long journey.",
                                  ),
                                }),
                              ],
                            }),
                            i.jsxs("span", {
                              className: "connection-pill",
                              children: [
                                i.jsx(Ei, { size: 14 }),
                                " ",
                                f("Demo locations"),
                              ],
                            }),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "search-box",
                          children: [
                            i.jsx(Rf, { size: 18 }),
                            i.jsx("input", {
                              value: Pr,
                              onChange: (c) => en(c.target.value),
                              placeholder: f("Search pharmacy or area..."),
                              "aria-label": f("Search pharmacies"),
                            }),
                          ],
                        }),
                        i.jsxs("div", {
                          className: "notice-banner",
                          children: [
                            i.jsx($n, { size: 17 }),
                            i.jsx("span", {
                              children: f(
                                "Sample directory only. Stock, distances, addresses and opening hours are not live or verified.",
                              ),
                            }),
                          ],
                        }),
                        pcNear(),
                        i.jsxs("div", {
                          className: "provider-list",
                          children: [
                            pcSort(Mr).map((c) =>
                              i.jsxs(
                                "div",
                                {
                                  className: "panel pharmacy-card",
                                  children: [
                                    i.jsx("div", {
                                      className: "pharmacy-icon",
                                      children: i.jsx(go, { size: 21 }),
                                    }),
                                    i.jsxs("div", {
                                      className: "provider-info",
                                      children: [
                                        i.jsx("h3", { children: c.name }),
                                        i.jsx("p", { children: f(c.area) }),
                                        i.jsxs("span", {
                                          children: [
                                            i.jsx(Ei, { size: 13 }),
                                            Gp && PCXY[c.name]
                                              ? pcD(Gp, PCXY[c.name]).toFixed(
                                                  1,
                                                ) +
                                                " km · " +
                                                f("approx., demo coordinates")
                                              : f(c.distance),
                                          ],
                                        }),
                                      ],
                                    }),
                                    i.jsxs("div", {
                                      className: "pharmacy-actions",
                                      children: [
                                        i.jsx("span", {
                                          className: `stock-pill ${c.tone}`,
                                          children: f(c.status),
                                        }),
                                        i.jsxs("button", {
                                          className: "button button-secondary",
                                          onClick: () =>
                                            Te(
                                              "Demo listing: live phone number and navigation are not connected.",
                                            ),
                                          children: [
                                            f("Details"),
                                            " ",
                                            i.jsx(Tt, { size: 14 }),
                                          ],
                                        }),
                                      ],
                                    }),
                                  ],
                                },
                                c.name,
                              ),
                            ),
                            Mr.length === 0 &&
                              i.jsx("div", {
                                className: "panel empty-state",
                                children: f(
                                  "No matching demo listings. Try another search.",
                                ),
                              }),
                          ],
                        }),
                      ],
                    }),
                  i.jsxs("footer", {
                    className: "footer",
                    children: [
                      i.jsx("span", {
                        children: f(
                          "© 2026 PahaadCare · Built for communities in the hills",
                        ),
                      }),
                      i.jsxs("span", {
                        children: [
                          i.jsx(Lt, { size: 13 }),
                          " ",
                          f("Prototype · Sample data only"),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              mm &&
                i.jsx("div", {
                  className: "mm-back",
                  onMouseDown: (c) => {
                    c.target === c.currentTarget && setMm(false);
                  },
                  children: i.jsxs("aside", {
                    className: "mm-drawer",
                    children: [
                      i.jsxs("div", {
                        className: "mm-head",
                        children: [
                          i.jsxs("span", {
                            className: "mm-title",
                            children: [
                              i.jsx("span", {
                                className: "brand-mark",
                                children: i.jsx(kr, { size: 19 }),
                              }),
                              i.jsx("strong", { children: "PahaadCare" }),
                            ],
                          }),
                          i.jsx("button", {
                            className: "icon-button",
                            onClick: () => setMm(false),
                            "aria-label": "Close menu",
                            children: i.jsx(dc, { size: 19 }),
                          }),
                        ],
                      }),
                      [
                        ["My Health", pl, "Health"],
                        ["Medicines", wr, "Medicines"],
                        ["Find Care", Pi, "Care"],
                        ["Pharmacies", go, "Stores"],
                      ].map(([c, C, F]) =>
                        i.jsxs(
                          "button",
                          {
                            className: `mm-item ${k === c ? "active" : ""}`,
                            onClick: () => {
                              (N(c), setMm(false));
                            },
                            children: [
                              i.jsx(C, { size: 19 }),
                              i.jsx("span", { children: f(F) }),
                            ],
                          },
                          c,
                        ),
                      ),
                      i.jsxs("button", {
                        className: "mm-item",
                        onClick: () => {
                          (setMm(false), It(true));
                        },
                        children: [
                          i.jsx(uc, { size: 19 }),
                          i.jsx("span", { children: "Settings" }),
                        ],
                      }),
                      i.jsxs("button", {
                        className: "mm-item mm-logout",
                        onClick: () => {
                          (setMm(false), $t());
                        },
                        children: [
                          i.jsx(xo, { size: 19 }),
                          i.jsx("span", { children: f("Log out") }),
                        ],
                      }),
                    ],
                  }),
                }),
              b && i.jsx(gc, { file: b, onClose: () => ae(null), tr: f }),
              kt &&
                i.jsx("div", {
                  className: "modal-backdrop",
                  children: i.jsxs("div", {
                    className: "modal sos-modal",
                    children: [
                      i.jsxs("h2", {
                        children: ["⏰ ", f("Time for medicine")],
                      }),
                      i.jsxs("p", {
                        children: [
                          i.jsx("strong", { children: kt.name }),
                          " · ",
                          kt.dose,
                          " · ",
                          kt.time,
                        ],
                      }),
                      i.jsx("button", {
                        className: "button button-primary",
                        onClick: () => Sn(null),
                        children: f("Stop"),
                      }),
                    ],
                  }),
                }),
              se &&
                i.jsx("div", {
                  className: "modal-backdrop",
                  onMouseDown: (c) => {
                    c.target === c.currentTarget && ce(false);
                  },
                  children: i.jsxs("div", {
                    className: "modal sos-modal",
                    children: [
                      i.jsx("h2", { children: "🚨 SOS" }),
                      i.jsx("a", {
                        className: "button sos-call",
                        href: "tel:112",
                        children: f("Call 112"),
                      }),
                      i.jsx("a", {
                        className: "button button-secondary",
                        href: "tel:108",
                        children: f("Ambulance 108"),
                      }),
                      i.jsx("button", {
                        className: "button button-secondary",
                        onClick: Zn,
                        children: f("My location"),
                      }),
                      Gm &&
                        i.jsx("p", { className: "gps-msg", children: f(Gm) }),
                      Gp &&
                        i.jsxs("div", {
                          className: "gps-box",
                          children: [
                            i.jsx("strong", { children: f("Your location") }),
                            i.jsx("span", {
                              children:
                                "Lat " +
                                Gp.lat.toFixed(5) +
                                ", Lon " +
                                Gp.lon.toFixed(5) +
                                " · ±" +
                                Gp.acc +
                                " m",
                            }),
                            i.jsx("a", {
                              className: "button button-primary",
                              href:
                                "https://wa.me/?text=" +
                                encodeURIComponent(pcMsg()),
                              target: "_blank",
                              rel: "noopener",
                              children: f("Share on WhatsApp"),
                            }),
                            i.jsx("a", {
                              className: "button button-secondary",
                              href: "sms:?&body=" + encodeURIComponent(pcMsg()),
                              children: f("Send SMS"),
                            }),
                            i.jsx("a", {
                              className: "button button-secondary",
                              href: pcMap(Gp),
                              target: "_blank",
                              rel: "noopener",
                              children: f("Open in Maps"),
                            }),
                            i.jsx("button", {
                              className: "button button-secondary",
                              onClick: pcCopy,
                              children: f("Copy location link"),
                            }),
                          ],
                        }),
                      pcFam(),
                      i.jsx("button", {
                        className: "button button-secondary",
                        onClick: () => ce(false),
                        children: f("Back"),
                      }),
                    ],
                  }),
                }),
              En &&
                i.jsx("div", {
                  className: "modal-backdrop",
                  onMouseDown: (c) => {
                    c.target === c.currentTarget && It(false);
                  },
                  children: i.jsxs("form", {
                    className: "modal",
                    onSubmit: zn,
                    children: [
                      i.jsxs("div", {
                        className: "modal-header",
                        children: [
                          i.jsxs("div", {
                            children: [
                              i.jsxs("span", {
                                className: "eyebrow",
                                children: [
                                  i.jsx("span", { className: "eyebrow-line" }),
                                  " ",
                                  f("PERSONAL DETAILS"),
                                ],
                              }),
                              i.jsx("h2", {
                                children: f("Edit health profile"),
                              }),
                            ],
                          }),
                          i.jsx("button", {
                            type: "button",
                            className: "icon-button",
                            onClick: () => It(false),
                            children: i.jsx(dc, { size: 19 }),
                          }),
                        ],
                      }),
                      i.jsxs("label", {
                        children: [
                          f("Full name"),
                          i.jsx("input", {
                            name: "name",
                            defaultValue: ue.name,
                            required: true,
                          }),
                        ],
                      }),
                      i.jsxs("label", {
                        children: [
                          f("Village / area"),
                          i.jsx("input", {
                            name: "village",
                            defaultValue: ue.village,
                            required: true,
                          }),
                        ],
                      }),
                      i.jsxs("div", {
                        className: "form-two",
                        children: [
                          i.jsxs("label", {
                            children: [
                              f("Blood group"),
                              i.jsxs("select", {
                                name: "bloodGroup",
                                defaultValue: ue.bloodGroup,
                                children: [
                                  i.jsx("option", { children: "A+" }),
                                  i.jsx("option", { children: "A-" }),
                                  i.jsx("option", { children: "B+" }),
                                  i.jsx("option", { children: "B-" }),
                                  i.jsx("option", { children: "AB+" }),
                                  i.jsx("option", { children: "AB-" }),
                                  i.jsx("option", { children: "O+" }),
                                  i.jsx("option", { children: "O-" }),
                                  i.jsx("option", { children: f("Unknown") }),
                                ],
                              }),
                            ],
                          }),
                          i.jsxs("label", {
                            children: [
                              f("Known allergies"),
                              i.jsx("input", {
                                name: "allergies",
                                defaultValue: ue.allergies,
                              }),
                            ],
                          }),
                        ],
                      }),
                      i.jsxs("label", {
                        children: [
                          f("Existing conditions"),
                          i.jsx("input", {
                            name: "conditions",
                            defaultValue: ue.conditions,
                          }),
                        ],
                      }),
                      pcFamEdit(),
                      i.jsxs("div", {
                        className: "report-upload",
                        children: [
                          i.jsx("h3", { children: f("Medical reports") }),
                          i.jsxs("button", {
                            type: "button",
                            className: "button button-secondary upload-btn",
                            onClick: () => {
                              const x =
                                document.getElementById("pc-report-input");
                              x && x.click();
                            },
                            children: [
                              i.jsx(hl, { size: 16 }),
                              " ",
                              f("Upload medical report"),
                            ],
                          }),
                          i.jsx("input", {
                            id: "pc-report-input",
                            type: "file",
                            accept: "image/*,.pdf,application/pdf",
                            hidden: true,
                            onChange: pcUpload,
                          }),
                          i.jsx("small", {
                            className: "upload-hint",
                            children: f(
                              "Image or PDF. Images are compressed automatically; PDF max 1 MB.",
                            ),
                          }),
                          V.filter((r) => r.source === "patient-upload")
                            .length === 0
                            ? i.jsx("small", {
                                className: "upload-hint",
                                children: f("No reports uploaded yet."),
                              })
                            : V.filter(
                                (r) => r.source === "patient-upload",
                              ).map((r) =>
                                i.jsxs(
                                  "div",
                                  {
                                    className: "report-item",
                                    children: [
                                      r.file &&
                                      r.file.type &&
                                      r.file.type.startsWith("image/")
                                        ? i.jsx("img", {
                                            src: r.file.data,
                                            alt: "",
                                          })
                                        : i.jsx("span", {
                                            className: "report-doc",
                                            children: i.jsx(pl, { size: 18 }),
                                          }),
                                      i.jsxs("span", {
                                        className: "report-name",
                                        children: [
                                          i.jsx("strong", {
                                            children: r.title,
                                          }),
                                          i.jsx("small", { children: r.date }),
                                        ],
                                      }),
                                      r.file &&
                                        i.jsx("a", {
                                          className: "report-link",
                                          href: r.file.data,
                                          download: r.file.name,
                                          children: f("Download"),
                                        }),
                                      i.jsx("button", {
                                        type: "button",
                                        className: "icon-button",
                                        "aria-label": "Remove",
                                        onClick: () =>
                                          fe((a) =>
                                            a.filter((x) => x.id !== r.id),
                                          ),
                                        children: i.jsx(dc, { size: 16 }),
                                      }),
                                    ],
                                  },
                                  r.id,
                                ),
                              ),
                        ],
                      }),
                      i.jsxs("p", {
                        className: "modal-note",
                        children: [
                          i.jsx(Lt, { size: 14 }),
                          " ",
                          f(
                            "Demo profile only. Saved locally in this browser.",
                          ),
                        ],
                      }),
                      i.jsxs("button", {
                        type: "button",
                        className: "button button-secondary logout-btn",
                        onClick: $t,
                        children: [i.jsx(xo, { size: 16 }), " ", f("Log out")],
                      }),
                      i.jsxs("div", {
                        className: "modal-actions",
                        children: [
                          i.jsx("button", {
                            type: "button",
                            className: "button button-secondary",
                            onClick: () => It(false),
                            children: f("Cancel"),
                          }),
                          i.jsxs("button", {
                            className: "button button-primary",
                            type: "submit",
                            children: [
                              i.jsx(fl, { size: 16 }),
                              " ",
                              f("Save profile"),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                }),
              vl &&
                i.jsx("div", {
                  className: "modal-backdrop",
                  onMouseDown: (c) => {
                    c.target === c.currentTarget && tn(false);
                  },
                  children: i.jsxs("div", {
                    className: "modal",
                    children: [
                      i.jsxs("div", {
                        className: "modal-header",
                        children: [
                          i.jsxs("div", {
                            children: [
                              i.jsxs("span", {
                                className: "eyebrow",
                                children: [
                                  i.jsx("span", { className: "eyebrow-line" }),
                                  " ",
                                  f("APPOINTMENT REQUEST"),
                                ],
                              }),
                              i.jsx("h2", { children: f("Request a visit") }),
                            ],
                          }),
                          i.jsx("button", {
                            className: "icon-button",
                            onClick: () => tn(false),
                            children: i.jsx(dc, { size: 19 }),
                          }),
                        ],
                      }),
                      i.jsxs("div", {
                        className: "notice-banner",
                        children: [
                          i.jsx($n, { size: 17 }),
                          i.jsx("span", {
                            children: f(
                              "This is a demo. No doctor will receive this request.",
                            ),
                          }),
                        ],
                      }),
                      i.jsxs("label", {
                        children: [
                          f("Reason for visit"),
                          i.jsxs("select", {
                            defaultValue: "General consultation",
                            children: [
                              i.jsx("option", {
                                children: f("General consultation"),
                              }),
                              i.jsx("option", { children: f("Follow-up") }),
                              i.jsx("option", {
                                children: f("Referral discussion"),
                              }),
                              i.jsx("option", {
                                children: f("Medicine review"),
                              }),
                            ],
                          }),
                        ],
                      }),
                      i.jsxs("label", {
                        children: [
                          f("Preferred mode"),
                          i.jsxs("select", {
                            defaultValue: "Phone consultation",
                            children: [
                              i.jsx("option", {
                                children: f("Phone consultation"),
                              }),
                              i.jsx("option", {
                                children: f("Video consultation"),
                              }),
                              i.jsx("option", {
                                children: f("In-person visit"),
                              }),
                            ],
                          }),
                        ],
                      }),
                      i.jsxs("div", {
                        className: "modal-actions",
                        children: [
                          i.jsx("button", {
                            className: "button button-secondary",
                            onClick: () => tn(false),
                            children: f("Cancel"),
                          }),
                          i.jsx("button", {
                            className: "button button-primary",
                            onClick: () => {
                              (tn(false),
                                Te(
                                  "Demo request only — no appointment has been booked.",
                                ));
                            },
                            children: f("Submit demo request"),
                          }),
                        ],
                      }),
                    ],
                  }),
                }),
              yl &&
                i.jsxs("div", {
                  className: "toast",
                  children: [i.jsx(yo, { size: 17 }), yl],
                }),
              i.jsxs("nav", {
                className: "mobile-nav",
                children: [
                  Xn.slice(0, 4).map((c) => {
                    const C = c.icon;
                    return i.jsxs(
                      "button",
                      {
                        className: k === c.name ? "active" : "",
                        onClick: () => N(c.name),
                        children: [
                          i.jsx(C, { size: 19 }),
                          i.jsx("span", {
                            children: f(
                              c.name === "Overview"
                                ? "Home"
                                : c.name === "My Health"
                                  ? "Health"
                                  : c.name === "Find Care"
                                    ? "Care"
                                    : c.name,
                            ),
                          }),
                        ],
                      },
                      c.name,
                    );
                  }),
                  i.jsxs("button", {
                    onClick: () => N("Pharmacies"),
                    className: k === "Pharmacies" ? "active" : "",
                    children: [
                      i.jsx(go, { size: 19 }),
                      i.jsx("span", { children: f("Stores") }),
                    ],
                  }),
                ],
              }),
            ],
          })
        : i.jsx(jf, {
            onLogin: (c, C) => {
              (U(c), Y(c));
              const F = wt("pc-data-" + c, null),
                G = !Object.keys(localStorage).some((ye) =>
                  ye.startsWith("pc-data-"),
                );
              (F
                ? (Cn(F.patient),
                  Dt(F.medicines),
                  me(F.members),
                  le(F.doseLogs),
                  fe(F.reports))
                : G
                  ? Cn((ye) => ({ ...ye, name: C }))
                  : (Cn({
                      name: C,
                      village: "",
                      bloodGroup: "",
                      allergies: "",
                      conditions: "",
                    }),
                    Dt([]),
                    me([{ id: "self", name: "Self" }]),
                    le([]),
                    fe([])),
                localStorage.setItem("pc-auth-user", JSON.stringify(c)),
                localStorage.setItem("pc-patient-id", JSON.stringify(c)),
                localStorage.setItem("pc-patient-name", JSON.stringify(C)));
            },
          })
      : i.jsx(Af, {
          language: je,
          tr: f,
          setLanguage: (c) => {
            (Ot(c), localStorage.setItem("pc-language", JSON.stringify(c)));
          },
          onPatient: () => {
            (at("patient"),
              localStorage.setItem("pc-role", JSON.stringify("patient")));
          },
        });
}


export default Qf
