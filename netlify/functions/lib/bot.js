/**
 * BloodLink WhatsApp Bot – State Machine
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  STATES                                                                  │
 * │  IDLE         → main menu                                               │
 * │  REG_BLOOD    → donor picks blood group                                 │
 * │  REG_DAYS     → donor picks last-donation days                          │
 * │  REG_LOCATION → donor shares location                                   │
 * │  FIND_BLOOD   → seeker picks needed blood group                         │
 * │  FIND_LOCATION→ seeker shares location → bot notifies donors            │
 * │  DONOR_REPLY  → donor responds to blood request notification            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * All interactive input uses buttons or lists – no free-text required.
 */

const wa = require("./wa");
const db = require("./db");

// ── Constants ─────────────────────────────────────────────────────────────

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const DAYS_OPTIONS = [15, 30, 45, 60, 75, 90, 105, 120];
const MIN_DONATION_GAP = 120; // days
const MAX_NOTIFY_DONORS = 5;  // notify at most 5 nearest donors per request

// ── Section builders for list messages ───────────────────────────────────

function bloodGroupSection(prefix = "bg") {
  return [
    {
      title: "Choose Blood Group",
      rows: BLOOD_GROUPS.map((bg) => ({
        id: `${prefix}_${bg.replace("+", "p").replace("-", "m")}`,
        title: bg,
      })),
    },
  ];
}

function daysSection() {
  return [
    {
      title: "Days Since Last Donation",
      rows: DAYS_OPTIONS.map((d) => ({
        id: `days_${d}`,
        title: d === 120 ? "120+ days ago" : `${d} days ago`,
      })),
    },
  ];
}

// Reverse-map id back to blood group string  e.g. bg_Ap → "A+", bg_Om → "O-"
function idToBloodGroup(id) {
  return id
    .replace(/^(bg|find)_/, "")
    .replace("p", "+")
    .replace("m", "-");
}

// ── Main menu ─────────────────────────────────────────────────────────────

async function showMainMenu(phone) {
  await wa.sendButtons(
    phone,
    "🩸 *BloodLink*\n\nSaving lives, one message at a time.\n\nWhat would you like to do?",
    [
      { id: "register", title: "🩸 Register as Donor" },
      { id: "find",     title: "🔍 Find Blood Donor"  },
    ]
  );
  await db.setSession(phone, "IDLE", {});
}

// ── Handle a single incoming message ─────────────────────────────────────

async function handleMessage(phone, message) {
  const session = (await db.getSession(phone)) || { state: "IDLE", data: {} };
  const { state, data } = session;

  const msgType = message.type;

  // Extract interactive reply ID (button or list)
  const interactiveId =
    msgType === "interactive"
      ? message.interactive?.button_reply?.id ||
        message.interactive?.list_reply?.id
      : null;

  // ── Global escape: any text message resets to main menu ─────────────────
  if (msgType === "text") {
    const txt = (message.text?.body ?? "").toLowerCase().trim();
    if (["hi", "hello", "hey", "menu", "start", "0", "back"].includes(txt)) {
      return showMainMenu(phone);
    }
    // If user sends unexpected text during a flow, re-prompt
    if (state !== "IDLE") {
      await wa.sendText(
        phone,
        '_Please use the options provided, or send "menu" to go back to the main menu._'
      );
      return;
    }
    return showMainMenu(phone);
  }

  // ── State machine ────────────────────────────────────────────────────────
  switch (state) {

    // ── IDLE ──────────────────────────────────────────────────────────────
    case "IDLE": {
      if (interactiveId === "register") {
        await wa.sendList(
          phone,
          "🩸 *Step 1 of 3 — Blood Group*\n\nWhat is your blood group?",
          "Select",
          bloodGroupSection("bg")
        );
        await db.setSession(phone, "REG_BLOOD", {});
      } else if (interactiveId === "find") {
        await wa.sendList(
          phone,
          "🔍 *Step 1 of 2 — Blood Group Needed*\n\nWhich blood group do you need?",
          "Select",
          bloodGroupSection("find")
        );
        await db.setSession(phone, "FIND_BLOOD", {});
      } else {
        await showMainMenu(phone);
      }
      break;
    }

    // ── REGISTER → step 1: blood group ────────────────────────────────────
    case "REG_BLOOD": {
      if (interactiveId?.startsWith("bg_")) {
        const bloodGroup = idToBloodGroup(interactiveId);
        await wa.sendList(
          phone,
          `✅ Blood Group: *${bloodGroup}*\n\n🗓 *Step 2 of 3 — Last Donation*\n\nHow many days ago did you last donate blood?\n_(If you have never donated, choose 120+ days ago)_`,
          "Select",
          daysSection()
        );
        await db.setSession(phone, "REG_DAYS", { blood_group: bloodGroup });
      } else {
        await wa.sendList(
          phone,
          "Please select your blood group from the list below:",
          "Select",
          bloodGroupSection("bg")
        );
      }
      break;
    }

    // ── REGISTER → step 2: last donated days ──────────────────────────────
    case "REG_DAYS": {
      if (interactiveId?.startsWith("days_")) {
        const days = parseInt(interactiveId.replace("days_", ""), 10);
        await wa.sendLocationRequest(
          phone,
          `✅ Last donation: *${days === 120 ? "120+" : days} days ago*\n\n📍 *Step 3 of 3 — Your Location*\n\nTap the button below to share your approximate location.\n_(Your exact location is never shown to other users)_`
        );
        await db.setSession(phone, "REG_LOCATION", { ...data, last_donated_days: days });
      } else {
        await wa.sendList(
          phone,
          "Please select how many days ago you last donated:",
          "Select",
          daysSection()
        );
      }
      break;
    }

    // ── REGISTER → step 3: location ───────────────────────────────────────
    case "REG_LOCATION": {
      if (msgType === "location") {
        const { latitude, longitude } = message.location;

        // Calculate the actual last_donated_date
        const lastDonatedDate = new Date();
        lastDonatedDate.setDate(lastDonatedDate.getDate() - data.last_donated_days);

        await db.upsertDonor(phone, {
          blood_group:        data.blood_group,
          last_donated_days:  data.last_donated_days,
          last_donated_date:  lastDonatedDate.toISOString().split("T")[0],
          latitude,
          longitude,
        });

        const daysUntilEligible = MIN_DONATION_GAP - data.last_donated_days;
        const eligibilityMsg =
          daysUntilEligible <= 0
            ? "🟢 You are *currently eligible* to donate!"
            : `🟡 You will be eligible to donate in *${daysUntilEligible} more days*.`;

        await wa.sendText(
          phone,
          `✅ *Registration Successful!*\n\n` +
          `🩸 Blood Group : *${data.blood_group}*\n` +
          `🗓 Last Donated : *${data.last_donated_days === 120 ? "120+" : data.last_donated_days} days ago*\n` +
          `📍 Location     : Saved\n\n` +
          `${eligibilityMsg}\n\n` +
          `Thank you for registering, lifesaver! 💪\n` +
          `We will notify you when someone nearby needs your blood group.`
        );
        await showMainMenu(phone);
      } else {
        await wa.sendLocationRequest(
          phone,
          "📍 Please tap *Share Location* below to complete your registration:"
        );
      }
      break;
    }

    // ── FIND → step 1: blood group needed ─────────────────────────────────
    case "FIND_BLOOD": {
      if (interactiveId?.startsWith("find_")) {
        const bloodGroup = idToBloodGroup(interactiveId);
        await wa.sendLocationRequest(
          phone,
          `🔍 Looking for *${bloodGroup}* donors.\n\n📍 *Step 2 of 2 — Your Location*\n\nShare your location so we can find the nearest eligible donors.`
        );
        await db.setSession(phone, "FIND_LOCATION", { blood_group: bloodGroup });
      } else {
        await wa.sendList(
          phone,
          "Please select the blood group you need:",
          "Select",
          bloodGroupSection("find")
        );
      }
      break;
    }

    // ── FIND → step 2: seeker location → notify donors ────────────────────
    case "FIND_LOCATION": {
      if (msgType === "location") {
        const { latitude, longitude } = message.location;
        const { blood_group } = data;

        await wa.sendText(phone, `⏳ Searching for *${blood_group}* donors near you…`);

        const donors = await db.findEligibleDonors(blood_group, latitude, longitude);

        if (!donors.length) {
          await wa.sendText(
            phone,
            `😔 No eligible *${blood_group}* donors found within ${db.RADIUS_KM}km at this time.\n\n` +
            `Please contact your nearest blood bank or try again later.`
          );
          await showMainMenu(phone);
          return;
        }

        // Notify donors (fire-and-forget – don't block the seeker's response)
        const toNotify = donors.slice(0, MAX_NOTIFY_DONORS);
        await wa.sendText(
          phone,
          `✅ Found *${donors.length}* eligible *${blood_group}* donor(s) within ${db.RADIUS_KM}km.\n\n` +
          `We are notifying the *${toNotify.length}* nearest donor(s) right now.\n` +
          `They will reach out to you directly on WhatsApp if they are available. ❤️`
        );

        // Notify each donor
        for (const donor of toNotify) {
          try {
            await wa.sendButtons(
              donor.phone,
              `🆘 *Blood Request Alert!*\n\n` +
              `Someone ~*${donor.distKm.toFixed(1)} km* away urgently needs *${blood_group}* blood.\n\n` +
              `You are listed as an eligible donor.\nCan you help?`,
              [
                { id: `donor_yes_${phone}`, title: "✅ Yes, I can help" },
                { id: `donor_no_${phone}`,  title: "❌ Not available"   },
              ]
            );
            // Put donor in DONOR_REPLY state with seeker info
            await db.setSession(donor.phone, "DONOR_REPLY", {
              seeker_phone: phone,
              blood_group,
            });
          } catch (e) {
            console.error(`[bot] failed to notify donor ${donor.phone}:`, e.message);
          }
        }

        await showMainMenu(phone);
      } else {
        await wa.sendLocationRequest(
          phone,
          "📍 Please tap *Share Location* below so we can find donors near you:"
        );
      }
      break;
    }

    // ── DONOR_REPLY: donor responds to request notification ───────────────
    case "DONOR_REPLY": {
      const seekerPhone = data?.seeker_phone;
      const bloodGroup  = data?.blood_group;

      if (interactiveId?.startsWith("donor_yes_")) {
        // Share seeker's WhatsApp link with donor
        await wa.sendText(
          phone,
          `🙏 *Thank you for stepping up!*\n\n` +
          `The person needing *${bloodGroup}* blood is waiting.\n\n` +
          `👇 *Contact them on WhatsApp:*\n` +
          `https://wa.me/${seekerPhone}\n\n` +
          `_Please coordinate directly with them for the donation._`
        );
        // Also notify seeker that a donor is coming
        if (seekerPhone) {
          await wa.sendText(
            seekerPhone,
            `🎉 *Great News!*\n\n` +
            `A *${bloodGroup}* donor near you has agreed to help!\n\n` +
            `They will contact you on WhatsApp shortly.\n` +
            `Please keep your phone available. ❤️`
          );
        }
      } else if (interactiveId?.startsWith("donor_no_")) {
        await wa.sendText(
          phone,
          `Understood, no problem! We appreciate your consideration. 🙏\n\n` +
          `You are still registered as a donor and we may contact you again for future requests.`
        );
      } else {
        // Unrecognised input during donor reply – re-prompt
        await wa.sendText(
          phone,
          '_Please use the buttons above to respond, or send "menu" to go to the main menu._'
        );
        return; // Don't clear session
      }

      await showMainMenu(phone);
      break;
    }

    // ── Fallback ──────────────────────────────────────────────────────────
    default: {
      await showMainMenu(phone);
    }
  }
}

module.exports = { handleMessage };
