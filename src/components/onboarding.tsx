"use client";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Leaf,
  Wallet,
  Clock,
  Heart,
  Recycle,
} from "lucide-react";
import { Button } from "./ui/button";
import { preferencesSchema, type Preferences } from "@/lib/domain";
const goals = [
  ["Eat healthier", Heart],
  ["Save money", Wallet],
  ["Save cooking time", Clock],
  ["Reduce food waste", Recycle],
  ["Support fitness goals", Leaf],
] as const;
export default function Onboarding({
  initial,
  onSave,
  busy,
}: {
  initial: Preferences;
  onSave: (p: Preferences) => void;
  busy: boolean;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [step, setStep] = useState(0);
  const [p, setP] = useState(initial);
  const [error, setError] = useState("");
  const update = (v: Partial<Preferences>) => setP({ ...p, ...v });
  const toggle = (key: "allergies" | "equipment" | "cuisines", value: string) =>
    update({
      [key]: p[key].includes(value as never)
        ? p[key].filter((x) => x !== value)
        : [...p[key], value],
    });
  const titles = [
    "A kitchen that fits your life.",
    "Good food, your way.",
    "Let’s look out for you.",
    "How do you like to cook?",
    "A little budget goes a long way.",
    "Make it personal. Or keep it simple.",
  ];
  return (
    <section className="onboarding panel">
      <div className="eyebrow">YOUR KITCHEN, YOUR RULES</div>
      <div className="steps">
        {titles.map((_, i) => (
          <span key={i} className={i <= step ? "active" : ""} />
        ))}
      </div>
      <p className="muted">Step {step + 1} of 6 · About two minutes</p>
      <h1>{titles[step]}</h1>
      {step === 0 && (
        <>
          <label>
            Your first name
            <input
              value={p.name}
              maxLength={60}
              onChange={(e) => update({ name: e.target.value })}
            />
          </label>
          <p>What would you like a little help with?</p>
          <div className="choice-grid">
            {goals.map(([g, I]) => (
              <button
                key={g}
                className={`choice ${p.goal === g ? "selected" : ""}`}
                onClick={() => update({ goal: g })}
              >
                <I size={22} />
                {g}
                {p.goal === g && <Check size={16} />}
              </button>
            ))}
          </div>
        </>
      )}
      {step === 1 && (
        <>
          <p>We’ll use this as a strict ingredient filter.</p>
          <div className="choice-grid">
            {(
              ["Vegetarian", "Vegan", "Eggetarian", "Non-vegetarian"] as const
            ).map((d) => (
              <button
                className={`choice ${p.diet === d ? "selected" : ""}`}
                key={d}
                onClick={() => update({ diet: d })}
              >
                {d}
                {p.diet === d && <Check size={18} />}
              </button>
            ))}
          </div>
          <label>
            Other ingredients to exclude (comma separated)
            <input
              value={p.exclusions.join(",")}
              onChange={(e) =>
                update({
                  exclusions: e.target.value.split(",").filter(Boolean),
                })
              }
              placeholder="e.g. onion"
            />
          </label>
        </>
      )}
      {step === 2 && (
        <>
          <p>
            Allergies are hard constraints. Always check ingredient labels for
            cross-contact.
          </p>
          <div className="chips">
            {[
              "milk",
              "egg",
              "gluten",
              "peanut",
              "soy",
              "sesame",
              "tree nut",
              "shellfish",
              "fish",
            ].map((a) => (
              <button
                key={a}
                className={`chip ${p.allergies.includes(a) ? "selected" : ""}`}
                onClick={() => toggle("allergies", a)}
              >
                {a}
              </button>
            ))}
          </div>
          <label>
            All allergies, including custom (comma separated)
            <input
              value={p.allergies.join(",")}
              onChange={(e) =>
                update({ allergies: e.target.value.split(",").filter(Boolean) })
              }
              placeholder="Leave blank for no known allergies"
            />
          </label>
          <p className="note">
            Unrecognized restrictions pause suggestions until they can be
            matched reliably.
          </p>
        </>
      )}
      {step === 3 && (
        <>
          <div className="form-grid">
            <label>
              Maximum cooking time
              <select
                value={p.max_time}
                onChange={(e) => update({ max_time: +e.target.value })}
              >
                {[15, 20, 30, 35, 45, 60, 90].map((n) => (
                  <option key={n} value={n}>
                    {n} minutes
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cooking confidence
              <select
                value={p.skill}
                onChange={(e) =>
                  update({ skill: e.target.value as Preferences["skill"] })
                }
              >
                {["Beginner", "Comfortable", "Confident"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
          <p>What’s in your kitchen?</p>
          <div className="chips">
            {[
              "Stove",
              "Pan",
              "Pot",
              "Pressure cooker",
              "Microwave",
              "Oven",
            ].map((e) => (
              <button
                className={`chip ${p.equipment.includes(e as never) ? "selected" : ""}`}
                key={e}
                onClick={() => toggle("equipment", e)}
              >
                {e}
              </button>
            ))}
          </div>
          <p>Favorite cuisines</p>
          <div className="chips">
            {["Indian", "Other"].map((c) => (
              <button
                className={`chip ${p.cuisines.includes(c) ? "selected" : ""}`}
                key={c}
                onClick={() => toggle("cuisines", c)}
              >
                {c === "Other" ? "Open to everything" : c}
              </button>
            ))}
          </div>
        </>
      )}
      {step === 4 && (
        <>
          <p>A daily food budget in rupees. You can skip this.</p>
          <div className="chips">
            {[100, 150, 200, 300].map((n) => (
              <button
                key={n}
                className={`chip ${p.budget === n ? "selected" : ""}`}
                onClick={() => update({ budget: n })}
              >
                ₹{n}
              </button>
            ))}
          </div>
          <label>
            Daily budget (₹)
            <input
              type="number"
              min="0"
              max="10000"
              value={p.budget ?? ""}
              onChange={(e) =>
                update({ budget: e.target.value ? +e.target.value : null })
              }
            />
          </label>
          <Button
            variant="ghost"
            onClick={() => {
              update({ budget: null });
              setStep(5);
            }}
          >
            Skip budget
          </Button>
          <p className="note">
            Prices vary by store. We won’t invent shopping costs.
          </p>
        </>
      )}
      {step === 5 && (
        <>
          <p>
            Optional energy estimates use the Mifflin–St Jeor equation for
            adults. These are starting estimates, not medical advice.
            Specialized dietary needs deserve professional guidance.
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={!!p.nutrition}
              onChange={(e) =>
                update({
                  nutrition: e.target.checked
                    ? {
                        age: 22,
                        height: 170,
                        weight: 65,
                        sex: "female",
                        activity: 1.375,
                        steps: 5000,
                        exercise_frequency: 2,
                        exercise_type: "Walking",
                        goal: "maintenance",
                      }
                    : null,
                })
              }
            />{" "}
            I’d like a personalized estimate
          </label>
          {p.nutrition && (
            <div className="form-grid">
              {(
                [
                  "age",
                  "height",
                  "weight",
                  "steps",
                  "exercise_frequency",
                ] as const
              ).map((k) => (
                <label key={k}>
                  {
                    {
                      age: "Age (18+)",
                      height: "Height (cm)",
                      weight: "Weight (kg)",
                      steps: "Typical daily steps",
                      exercise_frequency: "Exercise days / week",
                    }[k]
                  }
                  <input
                    type="number"
                    value={p.nutrition![k]}
                    onChange={(e) =>
                      update({
                        nutrition: { ...p.nutrition!, [k]: +e.target.value },
                      })
                    }
                  />
                </label>
              ))}
              <label>
                Equation sex input
                <select
                  value={p.nutrition.sex}
                  onChange={(e) =>
                    update({
                      nutrition: {
                        ...p.nutrition!,
                        sex: e.target.value as "female" | "male",
                      },
                    })
                  }
                >
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </label>
              <label>
                Activity level
                <select
                  value={p.nutrition.activity}
                  onChange={(e) =>
                    update({
                      nutrition: { ...p.nutrition!, activity: +e.target.value },
                    })
                  }
                >
                  <option value="1.2">Mostly seated</option>
                  <option value="1.375">Lightly active</option>
                  <option value="1.55">Moderately active</option>
                  <option value="1.725">Very active</option>
                </select>
              </label>
              <label>
                Exercise type
                <input
                  value={p.nutrition.exercise_type}
                  onChange={(e) =>
                    update({
                      nutrition: {
                        ...p.nutrition!,
                        exercise_type: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                Nutrition goal
                <select
                  value={p.nutrition.goal}
                  onChange={(e) =>
                    update({
                      nutrition: {
                        ...p.nutrition!,
                        goal: e.target.value as "maintenance" | "muscle gain",
                      },
                    })
                  }
                >
                  <option value="maintenance">Maintenance</option>
                  <option value="muscle gain">Support muscle gain</option>
                </select>
              </label>
            </div>
          )}
          <p className="note">
            You can edit or remove this information from your profile at any
            time.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="modal-actions">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep(step - 1)}>
            <ArrowLeft size={16} />
            Back
          </Button>
        )}
        <Button
          disabled={busy || !ready}
          onClick={() => {
            if (step < 5) {
              setStep(step + 1);
              return;
            }
            const parsed = preferencesSchema.safeParse({
              ...p,
              onboarded: true,
            });
            if (!parsed.success) {
              setError(
                "Check your name and nutrition inputs, or skip the optional estimate.",
              );
              return;
            }
            onSave(parsed.data);
          }}
        >
          {step === 5
            ? busy
              ? "Saving…"
              : "Let’s stock your kitchen"
            : "Continue"}
          <ArrowRight size={16} />
        </Button>
      </div>
    </section>
  );
}
