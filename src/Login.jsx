// PahaadCare - LOGIN / REGISTER screen (Patient ID create + login)
import React from 'react'
import { jsx, jsxs, Fragment } from 'react/jsx-runtime'
import { createLivePatient } from './rpmApi'
const _ = React
const i = { jsx, jsxs, Fragment }

const hc = "pc-demo-accounts";
function ic() {
  try {
    return JSON.parse(localStorage.getItem(hc) || "[]");
  } catch {
    return [];
  }
}
// ============ LOGIN / REGISTER SCREEN (create Patient ID, login) ============
function jf({ onLogin: k, onBack: oe }) {
  const [N, h] = _.useState("login"),
    [Y, O] = _.useState(""),
    [U, re] = _.useState(""),
    [pe, V] = _.useState(""),
    [fe, Z] = _.useState("");
  async function le(he) {
    (he.preventDefault(), Z(""));
    const Ce = U.replace(/\D/g, "");
    if (Y.trim().length < 2) {
      Z("Please enter your full name.");
      return;
    }
    if (!/^[6-9]\d{9}$/.test(Ce)) {
      Z("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    const Q = ic();
    let $ = "";
    do $ = "PC-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    while (Q.some((q) => q.id === $));
    const B = { id: $, name: Y.trim(), phone: Ce };
    (localStorage.setItem(hc, JSON.stringify([...Q, B])),
      localStorage.setItem("pc-auth-user", JSON.stringify($)),
      localStorage.setItem("pc-patient-id", JSON.stringify($)),
      localStorage.setItem("pc-patient-name", JSON.stringify(B.name)));

    try {
      await createLivePatient({
        patient_id: $,
        display_name: B.name,
        phone: Ce,
        status: "Active",
      });
    } catch {
      // Offline fallback
    }

    k($, B.name);
  }
  function X(he) {
    (he.preventDefault(), Z(""));
    const Ce = U.replace(/\D/g, ""),
      Q = ic().find(
        ($) => $.id.toUpperCase() === pe.trim().toUpperCase() && $.phone === Ce,
      );
    if (!Q) {
      Z("Patient ID or registered phone number is incorrect.");
      return;
    }
    (localStorage.setItem("pc-auth-user", JSON.stringify(Q.id)),
      localStorage.setItem("pc-patient-id", JSON.stringify(Q.id)),
      localStorage.setItem("pc-patient-name", JSON.stringify(Q.name)),
      k(Q.id, Q.name));
  }
  return i.jsx("main", {
    style: Ve.page,
    children: i.jsxs("form", {
      onSubmit: N === "login" ? X : le,
      style: Ve.card,
      children: [
        i.jsx("button", {
          type: "button",
          style: {
            background: "none",
            border: "none",
            color: "#0d9488",
            fontSize: "13px",
            fontWeight: "600",
            cursor: "pointer",
            marginBottom: "16px",
            padding: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          },
          onClick: () => {
            if (oe) {
              oe();
            } else {
              try {
                localStorage.removeItem("pc-role");
              } catch {}
              if (typeof window !== "undefined") {
                window.location.hash = "#/";
              }
            }
          },
          children: "← Back to role selection",
        }),
        i.jsx("div", { style: Ve.logo, children: "♥" }),
        i.jsx("h1", { children: "Gramin 24*7" }),
        i.jsx("p", {
          style: Ve.subtitle,
          children: "Your health, your care, your community.",
        }),
        i.jsxs("div", {
          style: Ve.tabs,
          children: [
            i.jsx("button", {
              type: "button",
              style: N === "login" ? Ve.activeTab : Ve.tab,
              onClick: () => {
                (h("login"), Z(""));
              },
              children: "Login",
            }),
            i.jsx("button", {
              type: "button",
              style: N === "register" ? Ve.activeTab : Ve.tab,
              onClick: () => {
                (h("register"), Z(""));
              },
              children: "Register",
            }),
          ],
        }),
        N === "register" &&
          i.jsxs("label", {
            style: Ve.label,
            children: [
              "Full name",
              i.jsx("input", {
                style: Ve.input,
                value: Y,
                onChange: (he) => O(he.target.value),
                placeholder: "Enter patient name",
                required: true,
              }),
            ],
          }),
        N === "login" &&
          i.jsxs("label", {
            style: Ve.label,
            children: [
              "Patient ID",
              i.jsx("input", {
                style: Ve.input,
                value: pe,
                onChange: (he) => V(he.target.value),
                placeholder: "PC-A7K92M",
                required: true,
              }),
            ],
          }),
        i.jsxs("label", {
          style: Ve.label,
          children: [
            "Mobile number",
            i.jsx("input", {
              style: Ve.input,
              type: "tel",
              inputMode: "numeric",
              maxLength: 10,
              value: U,
              onChange: (he) =>
                re(he.target.value.replace(/\D/g, "").slice(0, 10)),
              placeholder: "10-digit mobile number",
              required: true,
            }),
          ],
        }),
        fe && i.jsx("p", { role: "alert", style: Ve.error, children: fe }),
        i.jsx("button", {
          type: "submit",
          style: Ve.submit,
          children:
            N === "login" ? "Login to your account" : "Create Patient ID",
        }),
        i.jsx("p", {
          style: Ve.note,
          children:
            "Production ready: Accounts automatically sync with the live database when connected, with offline fallback.",
        }),
        window.__pcMemStore &&
          i.jsx("p", {
            role: "alert",
            style: Ve.error,
            children:
              "Browser storage is blocked or full, so your data will not be saved after you close or refresh this page. Allow site data / cookies for this page, or clear old site data.",
          }),
      ],
    }),
  });
}
const Ve = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 20,
    background: "linear-gradient(135deg, #edf8f2, #f5f7fb)",
    fontFamily: "Arial, sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: 410,
    boxSizing: "border-box",
    padding: 28,
    borderRadius: 22,
    background: "white",
    boxShadow: "0 12px 45px #193b3015",
  },
  logo: {
    width: 54,
    height: 54,
    display: "grid",
    placeItems: "center",
    borderRadius: 16,
    background: "#dff5e9",
    color: "#16845b",
    fontSize: 32,
  },
  subtitle: { color: "#64748b", marginBottom: 24 },
  tabs: { display: "flex", gap: 8, marginBottom: 22 },
  tab: {
    flex: 1,
    padding: 12,
    border: "1px solid #dce5e0",
    borderRadius: 10,
    background: "white",
    cursor: "pointer",
  },
  activeTab: {
    flex: 1,
    padding: 12,
    border: "1px solid #167c59",
    borderRadius: 10,
    background: "#167c59",
    color: "white",
    cursor: "pointer",
  },
  label: { display: "block", fontSize: 14, fontWeight: 600, marginBottom: 16 },
  input: {
    display: "block",
    boxSizing: "border-box",
    width: "100%",
    padding: 13,
    marginTop: 8,
    border: "1px solid #d5ded9",
    borderRadius: 10,
    fontSize: 15,
  },
  submit: {
    width: "100%",
    padding: 14,
    border: 0,
    borderRadius: 10,
    background: "#167c59",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  },
  error: { color: "#c62828", fontSize: 14 },
  note: { color: "#64748b", fontSize: 12, lineHeight: 1.6, marginTop: 18 },
};

export { jf }
export default jf
