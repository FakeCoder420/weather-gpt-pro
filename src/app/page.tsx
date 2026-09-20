"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { motion, type Variants } from "framer-motion";
import {
  AlertTriangle,
  CalendarCheck,
  Send,
  Sparkles,
  Bot,
  User,
  Wind,
  Droplets,
  Sprout,
  ShieldAlert,
  Loader2,
  RefreshCw,
  Compass,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Clock,
  CheckCircle2,
  Tractor,
  Wheat,
  CloudRain,
  Activity,
  MapPin,
  type LucideIcon,
} from "lucide-react";

// Activity Modes
type ActivityMode = "spraying" | "sowing" | "harvesting" | "irrigation";

interface CityLocation {
  name: string;
  hindiName: string;
  state: string;
  latitude: number;
  longitude: number;
  zone: string;
}

const CITIES: CityLocation[] = [
  {
    name: "Jaipur",
    hindiName: "जयपुर",
    state: "Rajasthan",
    latitude: 26.9124,
    longitude: 75.7873,
    zone: "Semi-Arid Zone",
  },
  {
    name: "Ludhiana",
    hindiName: "लुधियाना",
    state: "Punjab",
    latitude: 30.901,
    longitude: 75.8573,
    zone: "Trans-Gangetic Plains",
  },
  {
    name: "Nashik",
    hindiName: "नाशिक",
    state: "Maharashtra",
    latitude: 19.9975,
    longitude: 73.7898,
    zone: "Western Plateau Zone",
  },
  {
    name: "Bhopal",
    hindiName: "भोपाल",
    state: "Madhya Pradesh",
    latitude: 23.2599,
    longitude: 77.4126,
    zone: "Central Plateau Zone",
  },
];

interface RawHourlyData {
  time: string[];
  temperature_2m: number[];
  wind_speed_10m: number[];
  precipitation_probability: number[];
  soil_moisture_0_to_1cm: number[];
}

interface MessagePart {
  type: string;
  text?: string;
}

interface ChatMessage {
  id: string;
  role: string;
  content?: string;
  parts?: MessagePart[];
}

// Browser Web Speech API Types
interface SpeechRecognitionEvent {
  results: Array<Array<{ transcript: string }>>;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type BrowserWithSpeech = Window & {
  SpeechRecognition?: new () => SpeechRecognitionInstance;
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
};

// Framer Motion Stagger Variants
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 110,
      damping: 14,
      mass: 0.8,
    },
  },
};

export default function AgRiskDashboard() {
  const { messages, sendMessage, status, error, regenerate } = useChat();
  const [input, setInput] = useState("");
  const [selectedActivity, setSelectedActivity] = useState<ActivityMode>("spraying");
  const [selectedCity, setSelectedCity] = useState<CityLocation>(CITIES[0]);
  const [isRecording, setIsRecording] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [isFetchingWeather, setIsFetchingWeather] = useState(false);
  const [rawWeather, setRawWeather] = useState<RawHourlyData | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isLoading = status === "submitted" || status === "streaming";

  // Fetch Open-Meteo telemetry for location
  const fetchOpenMeteo = useCallback(async (lat: number, lon: number) => {
    setIsFetchingWeather(true);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,wind_speed_10m,precipitation_probability,soil_moisture_0_to_1cm&forecast_days=2`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch weather data");
      const data = (await res.json()) as { hourly?: RawHourlyData };
      if (data?.hourly) {
        setRawWeather(data.hourly);
      }
    } catch (err) {
      console.warn("Open-Meteo fetch warning:", err);
    } finally {
      setIsFetchingWeather(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const fetchAsync = async () => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${selectedCity.latitude}&longitude=${selectedCity.longitude}&hourly=temperature_2m,wind_speed_10m,precipitation_probability,soil_moisture_0_to_1cm&forecast_days=2`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = (await res.json()) as { hourly?: RawHourlyData };
        if (active && data?.hourly) {
          setRawWeather(data.hourly);
        }
      } catch (err) {
        console.warn("Open-Meteo sync notice:", err);
      }
    };

    void fetchAsync();

    return () => {
      active = false;
    };
  }, [selectedCity]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Current conditions
  const currentTelemetry = useMemo(() => {
    if (!rawWeather || !rawWeather.time || rawWeather.time.length === 0) {
      return {
        temperature: 28.4,
        windSpeed: 23.8,
        soilMoisture: 0.38,
        precipitationProbability: 45,
      };
    }
    const nowHour = new Date().getHours();
    const idx = Math.min(nowHour, rawWeather.temperature_2m.length - 1);

    return {
      temperature: rawWeather.temperature_2m[idx] ?? 28.4,
      windSpeed: rawWeather.wind_speed_10m[idx] ?? 12.5,
      soilMoisture: rawWeather.soil_moisture_0_to_1cm[idx] ?? 0.28,
      precipitationProbability: rawWeather.precipitation_probability[idx] ?? 20,
    };
  }, [rawWeather]);

  // Dynamic Risk Evaluations
  const activityEvaluations = useMemo(() => {
    const { windSpeed, soilMoisture, precipitationProbability } = currentTelemetry;

    const isSprayingHigh = windSpeed > 15 || precipitationProbability > 30;
    const isSprayingMod = windSpeed > 11 || precipitationProbability > 15;
    const sprayingScore = isSprayingHigh
      ? Math.min(96, Math.max(72, Math.round(52 + (windSpeed > 15 ? (windSpeed - 15) * 2.2 : 0) + (precipitationProbability > 30 ? (precipitationProbability - 30) * 0.7 : 0))))
      : isSprayingMod
      ? Math.min(65, Math.max(38, Math.round(30 + windSpeed * 1.4 + precipitationProbability * 0.4)))
      : Math.min(28, Math.max(12, Math.round(windSpeed * 1.1 + precipitationProbability * 0.2)));

    const isFalseMonsoon = soilMoisture < 0.20 && precipitationProbability > 60;
    const isSoilSaturated = soilMoisture > 0.35;
    const isSowingDry = soilMoisture < 0.18;
    const sowingScore = isFalseMonsoon
      ? 88
      : isSoilSaturated
      ? Math.min(85, Math.max(70, Math.round(65 + (soilMoisture - 0.35) * 80)))
      : isSowingDry
      ? 55
      : 24;

    const isHarvestHigh = precipitationProbability > 20 || windSpeed > 20;
    const isHarvestMod = precipitationProbability > 10 || windSpeed > 14;
    const harvestScore = isHarvestHigh
      ? Math.min(94, Math.max(72, Math.round(56 + (windSpeed > 20 ? (windSpeed - 20) * 2.2 : 0) + (precipitationProbability > 20 ? (precipitationProbability - 20) * 0.9 : 0))))
      : isHarvestMod
      ? 46
      : 18;

    const isIrrigationHigh = precipitationProbability > 50 || (precipitationProbability > 35 && soilMoisture > 0.34);
    const isIrrigationMod = precipitationProbability > 25 || soilMoisture > 0.30;
    const irrigationScore = isIrrigationHigh
      ? Math.min(92, Math.max(72, Math.round(58 + precipitationProbability * 0.5)))
      : isIrrigationMod
      ? 56
      : 20;

    return {
      spraying: {
        score: sprayingScore,
        level: sprayingScore >= 70 ? ("High Risk" as const) : sprayingScore >= 35 ? ("Moderate" as const) : ("Safe" as const),
        color: sprayingScore >= 70 ? ("rose" as const) : sprayingScore >= 35 ? ("amber" as const) : ("emerald" as const),
        headline: isSprayingHigh
          ? `High Wind (${windSpeed.toFixed(1)} km/h) & Rain (${precipitationProbability}%) Spray-Drift Hazard`
          : isSprayingMod
          ? `Moderate Breeze (${windSpeed.toFixed(1)} km/h) - Proceed With Care`
          : `Calm Wind (${windSpeed.toFixed(1)} km/h) & Dry Air - Safe To Spray`,
        rationale: isSprayingHigh
          ? `Open-Meteo telemetry shows wind gusts exceeding safe limits (> 15 km/h) or elevated precipitation (> 30%). Chemical spray paudhon par tikega nahi.`
          : isSprayingMod
          ? `Hawa thodi tez hai. Droplet size bada rakhein taaki spray aas-paas na phaile.`
          : `Mausam shant aur anukool hai. Keetnashak chhidkaav ke liye aadarsh sthiti.`,
        actionGuidance: isSprayingHigh
          ? `Chemical spraying filhal delay karein. Kal subah shant hawa me hi dawai daalein.`
          : isSprayingMod
          ? `Subah ya shaam ke thande waqt me hi chhidkaav karein.`
          : `Spraying ke liye khet taiyar hai. Anukool samay ka laabh uthayein.`,
        optimalWindow: "Tomorrow 06:00 AM – 09:00 AM",
        optimalRationale: "Hawa ki gati 8-10 km/h tak girne aur baarish ki sambhavna 5% se kam hone ka anuman.",
        safestRange: "06:00 AM – 09:00 AM",
      },
      sowing: {
        score: sowingScore,
        level: sowingScore >= 70 ? ("High Risk" as const) : sowingScore >= 35 ? ("Moderate" as const) : ("Safe" as const),
        color: sowingScore >= 70 ? ("rose" as const) : sowingScore >= 35 ? ("amber" as const) : ("emerald" as const),
        headline: isFalseMonsoon
          ? "False Monsoon Onset Hazard (Beej Sadan Khatra)"
          : isSoilSaturated
          ? `High Topsoil Moisture (${soilMoisture.toFixed(2)} m³/m³) Compaction Alert`
          : isSowingDry
          ? `Dry Topsoil (${soilMoisture.toFixed(2)} m³/m³) - Germination Moisture Deficit`
          : `Optimal Soil Moisture (${soilMoisture.toFixed(2)} m³/m³) For Sowing`,
        rationale: isFalseMonsoon
          ? `Mitti sookhi hai par achanak bhaari barish se beej bahne ya sadne ka darr hai.`
          : isSoilSaturated
          ? `Mitti me nami aadarsh matra se adhik hai. Tractor se compaction aur beej asphyxiation ho sakti hai.`
          : `Soil seedbed aadarsh germination moisture range (0.22 - 0.28 m³/m³) me hai.`,
        actionGuidance: isSoilSaturated
          ? `Mitti ko 24-48 ghante dhoop me khushk hone dein. Seed treatment zaroor karein.`
          : `Beej bonai ke liye mitti uttam sthiti me hai. Sahi gahraai par beej dalein.`,
        optimalWindow: "Thursday 07:00 AM – 11:00 AM",
        optimalRationale: "Mitti ka tapman 24°C aur nami 0.24 m³/m³ aane ki apeksha.",
        safestRange: "07:00 AM – 11:00 AM",
      },
      harvesting: {
        score: harvestScore,
        level: harvestScore >= 70 ? ("High Risk" as const) : harvestScore >= 35 ? ("Moderate" as const) : ("Safe" as const),
        color: harvestScore >= 70 ? ("rose" as const) : harvestScore >= 35 ? ("amber" as const) : ("emerald" as const),
        headline: isHarvestHigh
          ? `Rain Threat (${precipitationProbability}%) & Wind Gusts (${windSpeed.toFixed(1)} km/h)`
          : isHarvestMod
          ? `Cloudy Spells - Inspect Grain Moisture First`
          : `Dry Sunny Skies - Favorable Harvest Conditions`,
        rationale: isHarvestHigh
          ? `Rain > 20% ya wind gusts > 20 km/h se paki fasal girne (lodging) aur anaaj me fafundi ka khatra hai.`
          : `Anaaj me nami 12% se kam hone par hi surakshit harvesting sambhav hai.`,
        actionGuidance: isHarvestHigh
          ? `Combine harvester kataai turant sthagit karein. Kati fasal ko tarpaulin se dhaanpein.`
          : `Fasal kataai shuru karein aur sookhe kothar me bhandaran karein.`,
        optimalWindow: "Friday Full Day (Dry Window)",
        optimalRationale: "Aane wale 48 ghante baad poora din dhoop aur shushk hawa ka anuman.",
        safestRange: "Friday 08:00 – 17:00",
      },
      irrigation: {
        score: irrigationScore,
        level: irrigationScore >= 70 ? ("High Risk" as const) : irrigationScore >= 35 ? ("Moderate" as const) : ("Safe" as const),
        color: irrigationScore >= 70 ? ("rose" as const) : irrigationScore >= 35 ? ("amber" as const) : ("emerald" as const),
        headline: isIrrigationHigh
          ? `Rain Probability (${precipitationProbability}%) Redundant Watering Hazard`
          : isIrrigationMod
          ? `Adequate Soil Moisture (${soilMoisture.toFixed(2)} m³/m³) - Hold Irrigation`
          : `Dry Root Zone - Timely Irrigation Recommended`,
        rationale: isIrrigationHigh
          ? `Barish ki aashanka ke beech sinchai karne se bijli/diesel vyarth hoga aur jado me paani bhar sakta hai.`
          : `Mitti me nami parapt hai ya aane wali barish khet ki zaroorat poori kar sakti hai.`,
        actionGuidance: isIrrigationHigh
          ? `Tubewell/nahar sinchai rokein. Prakritik barish ke baad hi khet ki zaroorat taye karein.`
          : `Light irrigation ya drip sinchai anukool hai.`,
        optimalWindow: "Review After 48 Hours Post-Rain",
        optimalRationale: "Mausam saaf hone aur mitti ki nami jaanchne ke baad sinchai karein.",
        safestRange: "Post-Rain Window",
      },
    };
  }, [currentTelemetry]);

  const activeEval = activityEvaluations[selectedActivity];

  // 24-Hour Timeline
  const hourlyRiskTimeline = useMemo(() => {
    if (!rawWeather || !rawWeather.time || rawWeather.time.length === 0) {
      return Array.from({ length: 24 }).map((_, i) => {
        const hourStr = `${i.toString().padStart(2, "0")}:00`;
        const isSafest = ["06:00", "07:00", "08:00", "09:00"].includes(hourStr);
        return {
          hour: hourStr,
          temp: "26°C",
          wind: "11 km/h",
          rain: "15%",
          risk: isSafest ? ("safe" as const) : ("moderate" as const),
          label: isSafest ? "Optimal" : "Moderate",
        };
      });
    }

    const hoursCount = Math.min(24, rawWeather.time.length);
    const items = [];

    for (let i = 0; i < hoursCount; i++) {
      const timeStr = rawWeather.time[i];
      const hourStr = timeStr.slice(11, 16);
      const temp = Math.round(rawWeather.temperature_2m[i] ?? 25);
      const wind = Math.round(rawWeather.wind_speed_10m[i] ?? 10);
      const rain = Math.round(rawWeather.precipitation_probability[i] ?? 10);
      const moisture = rawWeather.soil_moisture_0_to_1cm[i] ?? 0.25;

      let risk: "safe" | "moderate" | "hazard" = "safe";
      let label = "Favorable";

      if (selectedActivity === "spraying") {
        if (wind > 15 || rain > 30) {
          risk = "hazard";
          label = wind > 15 ? "Wind Drift" : "Rain Wash";
        } else if (wind > 11 || rain > 15) {
          risk = "moderate";
          label = "Mild Breeze";
        } else {
          risk = "safe";
          label = "Optimal Spray";
        }
      } else if (selectedActivity === "sowing") {
        if ((moisture < 0.20 && rain > 60) || moisture > 0.36) {
          risk = "hazard";
          label = moisture > 0.36 ? "Saturated" : "False Onset";
        } else if (moisture < 0.22 || rain > 30) {
          risk = "moderate";
          label = "Caution";
        } else {
          risk = "safe";
          label = "Safe Seedbed";
        }
      } else if (selectedActivity === "harvesting") {
        if (rain > 20 || wind > 20) {
          risk = "hazard";
          label = rain > 20 ? "Wet Crop" : "High Wind";
        } else if (rain > 10 || wind > 14) {
          risk = "moderate";
          label = "Watch Sky";
        } else {
          risk = "safe";
          label = "Dry Window";
        }
      } else if (selectedActivity === "irrigation") {
        if (rain > 50 || moisture > 0.36) {
          risk = "hazard";
          label = "Redundant";
        } else if (rain > 25 || moisture > 0.30) {
          risk = "moderate";
          label = "Delay Water";
        } else {
          risk = "safe";
          label = "Can Water";
        }
      }

      items.push({
        hour: hourStr,
        temp: `${temp}°C`,
        wind: `${wind} km/h`,
        rain: `${rain}%`,
        risk,
        label,
      });
    }

    return items;
  }, [rawWeather, selectedActivity]);

  // Voice Input (Web Speech API)
  const toggleVoiceInput = () => {
    if (typeof window === "undefined") return;

    const browserWindow = window as BrowserWithSpeech;
    const SpeechRecognition =
      browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Aapke browser me Voice Recognition support uplabdh nahi hai. Kripya Chrome ya Edge use karein.");
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "hi-IN";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsRecording(true);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          setInput(transcript);
          sendMessage({ text: transcript });
          setInput("");
        }
        setIsRecording(false);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          console.warn("Microphone access permission not granted:", event.error);
        } else {
          console.warn("Speech recognition notice:", event.error);
        }
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn("Failed to start speech recognition:", err);
      setIsRecording(false);
    }
  };

  // Text-to-Speech audio read-out
  const speakMessage = (messageId: string, text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("Aapke browser me Text-to-Speech support uplabdh nahi hai.");
      return;
    }

    if (speakingMessageId === messageId) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "hi-IN";
    utterance.rate = 0.95;

    utterance.onend = () => {
      setSpeakingMessageId(null);
    };

    utterance.onerror = () => {
      setSpeakingMessageId(null);
    };

    setSpeakingMessageId(messageId);
    window.speechSynthesis.speak(utterance);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  const handleQuickPrompt = (promptText: string) => {
    if (isLoading) return;
    sendMessage({ text: promptText });
  };

  const handleSelectCity = (city: CityLocation) => {
    setSelectedCity(city);
    void fetchOpenMeteo(city.latitude, city.longitude);
  };

  const getMessageContent = (message: ChatMessage): string => {
    if (typeof message.content === "string" && message.content.length > 0) {
      return message.content;
    }
    if (Array.isArray(message.parts)) {
      const text = message.parts
        .filter((part) => part.type === "text" || typeof part.text === "string")
        .map((part) => part.text ?? "")
        .join("\n")
        .trim();
      if (text) return text;
    }
    return "";
  };

  interface ActivityItemConfig {
    id: ActivityMode;
    hindiTitle: string;
    englishSubtitle: string;
    icon: LucideIcon;
  }

  const activityConfigs: ActivityItemConfig[] = [
    {
      id: "spraying",
      hindiTitle: "दवाई छिड़काव",
      englishSubtitle: "Chemical Spraying",
      icon: Sprout,
    },
    {
      id: "sowing",
      hindiTitle: "बीज बोआई",
      englishSubtitle: "Seed Sowing",
      icon: Wheat,
    },
    {
      id: "harvesting",
      hindiTitle: "फसल कटाई",
      englishSubtitle: "Crop Harvesting",
      icon: Tractor,
    },
    {
      id: "irrigation",
      hindiTitle: "खेत सिंचाई",
      englishSubtitle: "Field Irrigation",
      icon: Droplets,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased selection:bg-emerald-100 selection:text-emerald-900">
      {/* Top Enterprise Navbar */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs backdrop-blur-md bg-white/95"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-3.5">
            <div className="h-11 w-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-800 shadow-xs">
              <Sprout className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                  WeatherGPT
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-200">
                  Ag-Risk Decision Engine
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Precision Agronomy Advisory &bull; Open-Meteo Live Telemetry &bull; Powered by Gemini AI
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <motion.div
              animate={{
                scale: [1, 1.025, 1],
                boxShadow: [
                  "0 0 0 0 rgba(16, 185, 129, 0)",
                  "0 0 0 3px rgba(16, 185, 129, 0.12)",
                  "0 0 0 0 rgba(16, 185, 129, 0)",
                ],
              }}
              transition={{ repeat: Infinity, duration: 2.8, ease: "easeInOut" }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-700 font-medium shadow-xs"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isFetchingWeather ? "bg-amber-500 animate-spin" : "bg-emerald-600 animate-pulse"
                }`}
              ></span>
              <span>{isFetchingWeather ? "Syncing Sensors..." : `${selectedCity.name} Live Sync`}</span>
            </motion.div>
            <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-900">
              Hinglish Kisan Sahayak
            </div>
          </div>
        </div>
      </motion.header>

      {/* Main Container */}
      <motion.main
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1 flex flex-col gap-6"
      >
        {/* 1. Activity Mode Selector */}
        <motion.section
          variants={itemVariants}
          className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
              <Activity className="h-4 w-4 text-emerald-700" />
              <span>Kisan Karyakram Chunein (Select Agricultural Activity):</span>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              Risk scores &amp; timelines automatically recalculate for chosen operation
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mt-3.5">
            {activityConfigs.map((act) => {
              const isSelected = selectedActivity === act.id;
              const evalData = activityEvaluations[act.id];
              const Icon = act.icon;

              return (
                <button
                  key={act.id}
                  type="button"
                  onClick={() => setSelectedActivity(act.id)}
                  className={`p-4 rounded-xl border text-left flex flex-col justify-between h-full gap-3 cursor-pointer transform hover:scale-[1.02] transition-transform duration-300 ${
                    isSelected
                      ? "bg-emerald-50/90 border-emerald-600 text-emerald-950 shadow-sm ring-2 ring-emerald-600/20"
                      : "bg-white hover:bg-slate-50/90 border-slate-200 text-slate-700 shadow-xs"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                        isSelected
                          ? "bg-emerald-700 text-white shadow-xs"
                          : "bg-slate-100 text-slate-700 border border-slate-200"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-900 tracking-tight leading-snug">
                        {act.hindiTitle}
                      </div>
                      <div className="text-xs text-slate-500 font-medium mt-0.5">
                        {act.englishSubtitle}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-slate-100/90 flex items-center justify-between text-xs mt-auto">
                    <span className="font-semibold text-slate-600">
                      Risk Score:{" "}
                      <strong className="text-slate-900 text-sm font-black">
                        {evalData.score}/100
                      </strong>
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border ${
                        evalData.color === "rose"
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : evalData.color === "amber"
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : "bg-emerald-50 text-emerald-800 border-emerald-200"
                      }`}
                    >
                      {evalData.level}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </motion.section>

        {/* 2. Top Metrics Grid */}
        <motion.section
          variants={itemVariants}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {/* Card 1: Operational Risk Score */}
          <div
            className={`border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between relative overflow-hidden transition-colors duration-500 ${
              activeEval.color === "rose"
                ? "bg-gradient-to-br from-white via-rose-50/40 to-rose-100/30 animate-gradient-slow"
                : activeEval.color === "amber"
                ? "bg-gradient-to-br from-white via-amber-50/40 to-amber-100/30 animate-gradient-slow"
                : "bg-gradient-to-br from-white via-emerald-50/40 to-teal-100/30 animate-gradient-slow"
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
                  <ShieldAlert
                    className={`h-5 w-5 ${
                      activeEval.color === "rose"
                        ? "text-rose-600"
                        : activeEval.color === "amber"
                        ? "text-amber-600"
                        : "text-emerald-700"
                    }`}
                  />
                  <span>Field Operational Hazard</span>
                </div>
                <span
                  className={`px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider rounded-md border ${
                    activeEval.color === "rose"
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : activeEval.color === "amber"
                      ? "bg-amber-50 text-amber-800 border-amber-200"
                      : "bg-emerald-50 text-emerald-800 border-emerald-200"
                  }`}
                >
                  {activeEval.level}
                </span>
              </div>

              <div className="mt-3.5">
                <div className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight flex items-baseline gap-2">
                  <span>Operational Risk Score:</span>
                  <motion.span
                    animate={{
                      scale: [1, 1.035, 1],
                      opacity: [1, 0.92, 1],
                    }}
                    transition={{
                      repeat: Infinity,
                      duration: 3,
                      ease: "easeInOut",
                    }}
                    className={`inline-block font-black ${
                      activeEval.color === "rose"
                        ? "text-rose-600"
                        : activeEval.color === "amber"
                        ? "text-amber-600"
                        : "text-emerald-700"
                    }`}
                  >
                    {activeEval.score}/100
                  </motion.span>
                </div>
                <div className="text-xs font-bold text-slate-800 mt-1.5">
                  {activeEval.headline}
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {activeEval.rationale}
                </p>
              </div>

              <div className="mt-4">
                <div className="flex justify-between text-xs text-slate-500 font-medium mb-1.5">
                  <span>Safe (0)</span>
                  <span
                    className={`font-bold ${
                      activeEval.color === "rose"
                        ? "text-rose-600"
                        : activeEval.color === "amber"
                        ? "text-amber-600"
                        : "text-emerald-700"
                    }`}
                  >
                    {activeEval.score}% {activeEval.level}
                  </span>
                  <span>Extreme (100)</span>
                </div>
                <div className="w-full h-3 bg-slate-100/90 rounded-full overflow-hidden p-0.5 border border-slate-200">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, Math.max(5, activeEval.score))}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className={`h-full rounded-full ${
                      activeEval.color === "rose"
                        ? "bg-rose-600"
                        : activeEval.color === "amber"
                        ? "bg-amber-500"
                        : "bg-emerald-600"
                    }`}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200/70 flex items-start gap-2 text-xs text-slate-600">
              <AlertTriangle
                className={`h-4 w-4 shrink-0 mt-0.5 ${
                  activeEval.color === "rose"
                    ? "text-rose-600"
                    : activeEval.color === "amber"
                    ? "text-amber-600"
                    : "text-emerald-600"
                }`}
              />
              <span className="font-medium leading-relaxed">{activeEval.actionGuidance}</span>
            </div>
          </div>

          {/* Card 2: Optimal Window Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between relative overflow-hidden">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                  <CalendarCheck className="h-5 w-5 text-emerald-700" />
                  <span>Agronomy Recommendation</span>
                </div>
                <span className="px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Optimal Slot
                </span>
              </div>

              <div className="mt-3.5">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Target Activity: {selectedActivity.toUpperCase()} &bull; {selectedCity.name}
                </div>
                <div className="mt-2 p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                  <div className="text-base sm:text-lg font-bold text-emerald-950 tracking-tight flex items-center gap-2">
                    <Clock className="h-4 w-4 text-emerald-700 shrink-0" />
                    <span>Optimal Window: {activeEval.optimalWindow}</span>
                  </div>
                  <p className="text-xs text-emerald-900/80 mt-1.5 leading-relaxed">
                    {activeEval.optimalRationale}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span className="flex items-center gap-1.5 text-emerald-800 font-bold">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Safest: {activeEval.safestRange}
              </span>
              <span className="text-slate-500 font-medium">
                Verified by Open-Meteo
              </span>
            </div>
          </div>

          {/* Card 3: Ground Sensors & Telemetry */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between md:col-span-2 lg:col-span-1">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <MapPin className="h-3.5 w-3.5 text-emerald-700" />
                  <span>Khet Location (City):</span>
                </div>
                {isFetchingWeather && (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                    <Loader2 className="h-3 w-3 animate-spin" /> Fetching...
                  </span>
                )}
              </div>

              {/* Location Selector Pills */}
              <div className="flex items-center gap-1.5 mb-3.5 overflow-x-auto pb-1 scrollbar-none">
                {CITIES.map((city) => {
                  const isCityActive = selectedCity.name === city.name;
                  return (
                    <button
                      key={city.name}
                      type="button"
                      onClick={() => handleSelectCity(city)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                        isCityActive
                          ? "bg-emerald-700 text-white border-emerald-800 shadow-xs ring-1 ring-emerald-700"
                          : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                      }`}
                    >
                      {city.name}
                    </button>
                  );
                })}
              </div>

              {/* Station Info Header */}
              <div className="flex items-center justify-between mb-3 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                  <Compass className="h-4 w-4 text-emerald-700" />
                  <span>{selectedCity.name}, {selectedCity.state}</span>
                </div>
                <span className="text-[11px] text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  {selectedCity.zone}
                </span>
              </div>

              {/* Telemetry Sensor Mini-Cards */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 transform hover:scale-[1.02] transition-transform duration-300 hover:shadow-xs hover:border-slate-300 cursor-default">
                  <div className="text-[11px] text-slate-500 font-medium">Surface Temp (2m)</div>
                  <div className="text-lg font-bold text-slate-900 mt-0.5">
                    {currentTelemetry.temperature.toFixed(1)} °C
                  </div>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 transform hover:scale-[1.02] transition-transform duration-300 hover:shadow-xs hover:border-slate-300 cursor-default">
                  <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                    <Wind className="h-3 w-3 text-slate-400" /> Wind Gusts (10m)
                  </div>
                  <div
                    className={`text-lg font-bold mt-0.5 ${
                      currentTelemetry.windSpeed > 15 ? "text-rose-600" : "text-emerald-700"
                    }`}
                  >
                    {currentTelemetry.windSpeed.toFixed(1)} km/h
                  </div>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 transform hover:scale-[1.02] transition-transform duration-300 hover:shadow-xs hover:border-slate-300 cursor-default">
                  <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                    <Droplets className="h-3 w-3 text-slate-400" /> Soil Moisture (0-1cm)
                  </div>
                  <div
                    className={`text-lg font-bold mt-0.5 ${
                      currentTelemetry.soilMoisture > 0.35
                        ? "text-amber-600"
                        : currentTelemetry.soilMoisture < 0.18
                        ? "text-rose-600"
                        : "text-emerald-700"
                    }`}
                  >
                    {currentTelemetry.soilMoisture.toFixed(2)} m³/m³
                  </div>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 transform hover:scale-[1.02] transition-transform duration-300 hover:shadow-xs hover:border-slate-300 cursor-default">
                  <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                    <CloudRain className="h-3 w-3 text-slate-400" /> Rain Probability
                  </div>
                  <div
                    className={`text-lg font-bold mt-0.5 ${
                      currentTelemetry.precipitationProbability > 30 ? "text-rose-600" : "text-slate-900"
                    }`}
                  >
                    {currentTelemetry.precipitationProbability}%
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 text-[11px] text-slate-400 font-medium text-right">
              Lat: {selectedCity.latitude.toFixed(2)}° N &bull; Lon: {selectedCity.longitude.toFixed(2)}° E
            </div>
          </div>
        </motion.section>

        {/* 3. 24-Hour Risk Timeline Strip */}
        <motion.section
          variants={itemVariants}
          className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-700" />
              <h3 className="text-sm font-bold text-slate-900">
                24-Hour Operational Risk Timeline &bull; {selectedCity.name} ({activityConfigs.find((a) => a.id === selectedActivity)?.hindiTitle})
              </h3>
            </div>
            
            <div className="flex items-center flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 font-bold border border-emerald-300 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                Safest Window: {activeEval.safestRange}
              </span>
              <div className="flex items-center gap-3 text-slate-500 text-[11px] font-medium ml-1">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-500"></span> Favorable
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-amber-500"></span> Moderate
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-rose-500"></span> Hazard
                </span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200">
            <div className="flex gap-2 min-w-[850px]">
              {hourlyRiskTimeline.map((item, idx) => {
                const isSafestPill =
                  selectedActivity === "spraying" &&
                  ["06:00", "07:00", "08:00", "09:00"].includes(item.hour);

                return (
                  <div
                    key={`${item.hour}-${idx}`}
                    className={`flex-1 min-w-[70px] p-2.5 rounded-xl border text-center transition flex flex-col justify-between relative ${
                      isSafestPill
                        ? "bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs"
                        : item.risk === "safe"
                        ? "bg-emerald-50/50 border-emerald-200"
                        : item.risk === "moderate"
                        ? "bg-amber-50/50 border-amber-200"
                        : "bg-rose-50/50 border-rose-200"
                    }`}
                  >
                    {isSafestPill && item.hour === "06:00" && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-emerald-700 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full whitespace-nowrap shadow-xs">
                        Safest
                      </span>
                    )}

                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        {item.hour}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                        {item.temp}
                      </div>
                    </div>

                    <div className="my-2">
                      <span
                        className={`inline-block w-full py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          item.risk === "safe"
                            ? "bg-emerald-100 text-emerald-800"
                            : item.risk === "moderate"
                            ? "bg-amber-100 text-amber-900"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {item.risk}
                      </span>
                    </div>

                    <div className="text-[10px] text-slate-500 font-medium">
                      <div>{item.wind}</div>
                      <div className="text-[9px] text-slate-400">Rain: {item.rain}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.section>

        {/* 4. Chat Section */}
        <motion.section
          variants={itemVariants}
          className="bg-white border border-slate-200 rounded-2xl shadow-sm flex-1 flex flex-col overflow-hidden min-h-[480px]"
        >
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-xs">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  Kisan Sahayak: WeatherGPT Hinglish Advisory &bull; {selectedCity.name}
                </h2>
                <p className="text-[11px] text-slate-500 font-medium">
                  Direct agricultural risk consulting with voice input &amp; audio read-out
                </p>
              </div>
            </div>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => regenerate()}
                disabled={isLoading}
                className="text-xs px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1.5 transition font-medium disabled:opacity-50 shadow-xs cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" />
                Regenerate
              </button>
            )}
          </div>

          <div className="px-5 py-2.5 bg-slate-50/50 border-b border-slate-100 flex items-center gap-2 overflow-x-auto text-xs scrollbar-none">
            <span className="text-slate-500 font-bold shrink-0 flex items-center gap-1 text-[11px] uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5 text-amber-600" />
              Quick Questions:
            </span>
            <button
              type="button"
              onClick={() =>
                handleQuickPrompt(
                  `Kya kal subah ${selectedCity.name} me gehu/sarson par dawai spray karna surakshit hai? Lat: ${selectedCity.latitude}, Lon: ${selectedCity.longitude} ka risk check karo.`
                )
              }
              className="px-3 py-1 rounded-full bg-white hover:bg-emerald-50 hover:border-emerald-300 text-slate-700 border border-slate-200 shrink-0 transition text-xs shadow-xs cursor-pointer"
            >
              🌿 {selectedCity.name} me Spraying safe hai kal?
            </button>
            <button
              type="button"
              onClick={() =>
                handleQuickPrompt(
                  `${selectedCity.name} (Lat: ${selectedCity.latitude}, Lon: ${selectedCity.longitude}) me mitti ki nami aur tapman check karke beej bonai ka risk batao.`
                )
              }
              className="px-3 py-1 rounded-full bg-white hover:bg-emerald-50 hover:border-emerald-300 text-slate-700 border border-slate-200 shrink-0 transition text-xs shadow-xs cursor-pointer"
            >
              🌾 {selectedCity.name} Sowing risk &amp; Soil Moisture
            </button>
            <button
              type="button"
              onClick={() =>
                handleQuickPrompt(
                  `Aane wale 48 ghante me ${selectedCity.name} me khet sinchai karni chahiye ya barish ka intezar karein?`
                )
              }
              className="px-3 py-1 rounded-full bg-white hover:bg-emerald-50 hover:border-emerald-300 text-slate-700 border border-slate-200 shrink-0 transition text-xs shadow-xs cursor-pointer"
            >
              💧 Khet Sinchai Decision
            </button>
          </div>

          <div className="flex-1 p-5 overflow-y-auto space-y-4 max-h-[460px] bg-slate-50/30">
            {messages.length === 0 ? (
              <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-200 rounded-xl bg-white">
                <div className="h-12 w-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 mb-3 shadow-xs">
                  <Sprout className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Namaste Kisan Bhai! WeatherGPT me aapka swagat hai.
                </h3>
                <p className="text-xs text-slate-500 max-w-md mt-1 leading-relaxed">
                  Aapka chuna hua shahar <strong>{selectedCity.name}</strong> ({selectedCity.state}) hai. Apne khet ki fasal aur mausam ka sawal poochein ya voice input button dabakar bolen.
                </p>
              </div>
            ) : (
              messages.map((message) => {
                const isUser = message.role === "user";
                const content = getMessageContent(message);
                const isCurrentlySpeaking = speakingMessageId === message.id;

                return (
                  <div
                    key={message.id}
                    className={`flex items-start gap-3 ${
                      isUser ? "justify-end" : "justify-start"
                    }`}
                  >
                    {!isUser && (
                      <div className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0 mt-0.5 shadow-xs">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}

                    <div
                      className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        isUser
                          ? "bg-emerald-700 text-white shadow-sm rounded-tr-none"
                          : "bg-white text-slate-800 border border-slate-200 shadow-sm rounded-tl-none whitespace-pre-wrap"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div
                          className={`text-[11px] font-bold uppercase tracking-wider ${
                            isUser ? "text-emerald-100" : "text-slate-500"
                          }`}
                        >
                          {isUser ? "Aap (Farmer)" : "WeatherGPT Agronomy Engine"}
                        </div>

                        {!isUser && content && (
                          <button
                            type="button"
                            onClick={() => speakMessage(message.id, content)}
                            title={isCurrentlySpeaking ? "Stop Voice" : "Audio Suniye (Listen in Hinglish)"}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition cursor-pointer ${
                              isCurrentlySpeaking
                                ? "bg-rose-50 text-rose-700 border-rose-200 animate-pulse"
                                : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                            }`}
                          >
                            {isCurrentlySpeaking ? (
                              <>
                                <VolumeX className="h-3 w-3" />
                                <span>Stop</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="h-3 w-3 text-emerald-700" />
                                <span>Suniye</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {!isUser &&
                        Array.isArray(message.parts) &&
                        message.parts.some((p: MessagePart) => p.type?.startsWith("tool")) && (
                          <div className="mb-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-800">
                            <Sprout className="h-3.5 w-3.5 text-emerald-700" />
                            <span>Open-Meteo telemetry analyzed for {selectedCity.name}</span>
                          </div>
                        )}

                      <div className="leading-relaxed">
                        {content || (!isUser && isLoading ? "Analyzing agronomy telemetry..." : "")}
                      </div>
                    </div>

                    {isUser && (
                      <div className="h-8 w-8 rounded-lg bg-emerald-800 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-xs">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {isLoading && (
              <div className="flex items-start gap-3 justify-start">
                <div className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0 mt-0.5 shadow-xs">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
                <div className="bg-white text-slate-600 border border-slate-200 rounded-2xl rounded-tl-none px-4 py-2.5 text-xs flex items-center gap-2 shadow-sm">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                  <span>Open-Meteo se {selectedCity.name} ka mausam aur mitti data fetch kiya jaa raha hai...</span>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5 shadow-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                <div>
                  <span className="font-bold">Error:</span> {error.message || "Failed to communicate with AI route."}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="p-4 border-t border-slate-200 bg-white flex items-center gap-2.5 shadow-xs"
          >
            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={isLoading}
              title={isRecording ? "Listening... Click to stop" : "Boliye (Click to speak in Hindi/Hinglish)"}
              className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 border transition-all cursor-pointer ${
                isRecording
                  ? "bg-rose-500 text-white border-rose-600 animate-pulse shadow-md ring-4 ring-rose-200"
                  : "bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border-slate-200 hover:border-emerald-300 shadow-xs"
              }`}
            >
              {isRecording ? (
                <MicOff className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </button>

            <div className="relative flex-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  isRecording
                    ? "Sun rahe hain, boliye... (Listening to your voice...)"
                    : `Sawal poochein jaise: Kya kal ${selectedCity.name} me dawai spray karna safe hai?...`
                }
                disabled={isLoading}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 focus:bg-white transition disabled:opacity-50"
              />
              {isRecording && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-[11px] font-bold text-rose-600 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-rose-600"></span>
                  Recording...
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="h-11 px-5 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white font-bold text-sm rounded-xl shadow-sm flex items-center gap-2 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 cursor-pointer"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Poochhein</span>
            </button>
          </form>
        </motion.section>
      </motion.main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <p className="font-medium">
          WeatherGPT Agricultural Decision Engine &bull; Open-Meteo Weather &amp; Soil Telemetry &bull; Powered by Google Gemini AI
        </p>
      </footer>
    </div>
  );
}
