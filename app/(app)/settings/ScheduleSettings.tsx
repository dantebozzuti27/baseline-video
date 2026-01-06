"use client";

import * as React from "react";
import { Button, Card } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { toast } from "@/app/(app)/toast";
import { Clock, Check, Plus, Trash2 } from "lucide-react";

type ScheduleSettings = {
  work_start_min: number;
  work_end_min: number;
  slot_min: number;
  auto_approve_lessons: boolean;
  booking_buffer_hours: number;
  max_advance_days: number;
  max_participants_per_lesson: number;
};

type AvailabilitySlot = {
  id: string;
  day_of_week: number;
  start_time_minutes: number;
  end_time_minutes: number;
  is_active: boolean;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTimeInput(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export default function ScheduleSettings() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  
  const [settings, setSettings] = React.useState<ScheduleSettings>({
    work_start_min: 480, // 8 AM
    work_end_min: 1080, // 6 PM
    slot_min: 30,
    auto_approve_lessons: false,
    booking_buffer_hours: 2,
    max_advance_days: 30,
    max_participants_per_lesson: 2
  });

  const [slots, setSlots] = React.useState<AvailabilitySlot[]>([]);
  
  // New slot form
  const [newSlotDay, setNewSlotDay] = React.useState(1); // Monday
  const [newSlotStart, setNewSlotStart] = React.useState("09:00");
  const [newSlotEnd, setNewSlotEnd] = React.useState("17:00");

  React.useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load schedule settings
      const { data: settingsData } = await supabase
        .from("coach_schedule_settings")
        .select("*")
        .eq("coach_user_id", user.id)
        .maybeSingle();

      if (settingsData) {
        setSettings({
          work_start_min: settingsData.work_start_min ?? 480,
          work_end_min: settingsData.work_end_min ?? 1080,
          slot_min: settingsData.slot_min ?? 30,
          auto_approve_lessons: settingsData.auto_approve_lessons ?? false,
          booking_buffer_hours: settingsData.booking_buffer_hours ?? 2,
          max_advance_days: settingsData.max_advance_days ?? 30,
          max_participants_per_lesson: settingsData.max_participants_per_lesson ?? 2
        });
      }

      // Load availability slots
      const { data: slotsData } = await supabase
        .from("coach_availability_slots")
        .select("*")
        .eq("coach_user_id", user.id)
        .order("day_of_week", { ascending: true })
        .order("start_time_minutes", { ascending: true });

      if (slotsData) {
        setSlots(slotsData);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const resp = await fetch("/api/lessons/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });

      if (resp.ok) {
        toast("Settings saved!");
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setSaving(false);
    }
  }

  async function addSlot() {
    try {
      const supabase = createSupabaseBrowserClient();
      const startMinutes = parseTimeToMinutes(newSlotStart);
      const endMinutes = parseTimeToMinutes(newSlotEnd);

      if (endMinutes <= startMinutes) {
        return;
      }

      const { data, error } = await supabase.rpc("set_coach_availability_slot", {
        p_day_of_week: newSlotDay,
        p_start_time_minutes: startMinutes,
        p_end_time_minutes: endMinutes,
        p_is_active: true
      });

      if (!error && data) {
        toast("Availability added!");
        loadSettings();
      }
    } catch (err) {
      console.error("Failed to add slot:", err);
    }
  }

  async function deleteSlot(slotId: string) {
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc("delete_coach_availability_slot", {
        p_slot_id: slotId
      });

      if (!error) {
        setSlots(slots.filter((s) => s.id !== slotId));
        toast("Availability removed!");
      }
    } catch (err) {
      console.error("Failed to delete slot:", err);
    }
  }

  // Group slots by day
  const slotsByDay = React.useMemo(() => {
    const grouped: Record<number, AvailabilitySlot[]> = {};
    for (const slot of slots) {
      if (!grouped[slot.day_of_week]) {
        grouped[slot.day_of_week] = [];
      }
      grouped[slot.day_of_week].push(slot);
    }
    return grouped;
  }, [slots]);

  if (loading) {
    return <div className="muted">Loading settings...</div>;
  }

  return (
    <div className="stack">
      {/* Auto-approve toggle */}
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 600 }}>Auto-approve lessons</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Automatically confirm when players book available times
          </div>
        </div>
        <button
          className={settings.auto_approve_lessons ? "pill" : "btn"}
          onClick={() => setSettings({ ...settings, auto_approve_lessons: !settings.auto_approve_lessons })}
        >
          {settings.auto_approve_lessons ? (
            <>
              <Check size={14} />
              On
            </>
          ) : (
            "Off"
          )}
        </button>
      </div>

      {/* Working hours */}
      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Working hours</div>
        <div className="row" style={{ alignItems: "center", gap: 8 }}>
          <input
            type="time"
            className="input"
            value={minutesToTimeInput(settings.work_start_min)}
            onChange={(e) => setSettings({ ...settings, work_start_min: parseTimeToMinutes(e.target.value) })}
            style={{ width: 120 }}
          />
          <span className="muted">to</span>
          <input
            type="time"
            className="input"
            value={minutesToTimeInput(settings.work_end_min)}
            onChange={(e) => setSettings({ ...settings, work_end_min: parseTimeToMinutes(e.target.value) })}
            style={{ width: 120 }}
          />
        </div>
      </div>

      {/* Lesson duration */}
      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Default lesson length</div>
        <select
          className="select"
          value={settings.slot_min}
          onChange={(e) => setSettings({ ...settings, slot_min: Number(e.target.value) })}
          style={{ width: 140 }}
        >
          <option value={15}>15 minutes</option>
          <option value={30}>30 minutes</option>
          <option value={45}>45 minutes</option>
          <option value={60}>60 minutes</option>
          <option value={90}>90 minutes</option>
        </select>
      </div>

      {/* Max participants */}
      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Max players per lesson</div>
        <select
          className="select"
          value={settings.max_participants_per_lesson}
          onChange={(e) => setSettings({ ...settings, max_participants_per_lesson: Number(e.target.value) })}
          style={{ width: 140 }}
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>{n} {n === 1 ? "player" : "players"}</option>
          ))}
        </select>
      </div>

      {/* Booking buffer */}
      <div className="row" style={{ gap: 24 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Booking buffer</div>
          <select
            className="select"
            value={settings.booking_buffer_hours}
            onChange={(e) => setSettings({ ...settings, booking_buffer_hours: Number(e.target.value) })}
            style={{ width: 140 }}
          >
            <option value={0}>No buffer</option>
            <option value={1}>1 hour</option>
            <option value={2}>2 hours</option>
            <option value={4}>4 hours</option>
            <option value={8}>8 hours</option>
            <option value={24}>24 hours</option>
          </select>
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Max advance booking</div>
          <select
            className="select"
            value={settings.max_advance_days}
            onChange={(e) => setSettings({ ...settings, max_advance_days: Number(e.target.value) })}
            style={{ width: 140 }}
          >
            <option value={7}>1 week</option>
            <option value={14}>2 weeks</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>
      </div>

      <Button variant="primary" onClick={saveSettings} disabled={saving}>
        {saving ? "Saving..." : "Save Settings"}
      </Button>

      {/* Availability slots */}
      <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
        <div className="row" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Weekly Availability</div>
            <div className="muted" style={{ fontSize: 13 }}>
              Set your recurring available times for lessons
            </div>
          </div>
        </div>

        {/* Add new slot */}
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div className="row" style={{ alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div className="label">Day</div>
              <select
                className="select"
                value={newSlotDay}
                onChange={(e) => setNewSlotDay(Number(e.target.value))}
                style={{ width: 140 }}
              >
                {DAYS.map((day, i) => (
                  <option key={i} value={i}>{day}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="label">Start</div>
              <input
                type="time"
                className="input"
                value={newSlotStart}
                onChange={(e) => setNewSlotStart(e.target.value)}
                style={{ width: 110 }}
              />
            </div>
            <div>
              <div className="label">End</div>
              <input
                type="time"
                className="input"
                value={newSlotEnd}
                onChange={(e) => setNewSlotEnd(e.target.value)}
                style={{ width: 110 }}
              />
            </div>
            <Button onClick={addSlot}>
              <Plus size={16} />
              Add
            </Button>
          </div>
        </div>

        {/* Existing slots */}
        {slots.length === 0 ? (
          <div className="muted" style={{ textAlign: "center", padding: "24px 16px" }}>
            No availability set yet. Add your available times above.
          </div>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {DAYS.map((day, dayIndex) => {
              const daySlots = slotsByDay[dayIndex];
              if (!daySlots || daySlots.length === 0) return null;

              return (
                <div key={dayIndex} className="row" style={{ alignItems: "center", gap: 12 }}>
                  <div style={{ width: 100, fontWeight: 600, fontSize: 14 }}>{day}</div>
                  <div className="row" style={{ gap: 8, flex: 1, flexWrap: "wrap" }}>
                    {daySlots.map((slot) => (
                      <div
                        key={slot.id}
                        className="row"
                        style={{
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 10px",
                          background: "rgba(99, 179, 255, 0.1)",
                          borderRadius: 8,
                          fontSize: 13
                        }}
                      >
                        <Clock size={14} />
                        <span>
                          {formatTime(slot.start_time_minutes)} - {formatTime(slot.end_time_minutes)}
                        </span>
                        <button
                          onClick={() => deleteSlot(slot.id)}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 4,
                            cursor: "pointer",
                            color: "var(--muted)"
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

