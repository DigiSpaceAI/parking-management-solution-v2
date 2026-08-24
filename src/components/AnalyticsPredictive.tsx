import React, { useState, useEffect } from 'react';
import { PredictiveAnalyticsReport } from '../types';
import {
  TrendingUp,
  AlertTriangle,
  Clock,
  Sparkles,
  Layers,
  Camera,
  Activity,
  Zap,
  ArrowUpRight,
  Send,
  Loader2,
  CheckCircle2
} from 'lucide-react';

export const AnalyticsPredictive: React.FC = () => {
  const [report, setReport] = useState<PredictiveAnalyticsReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [aiResponse, setAiResponse] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  const fetchForecast = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/analytics/prediction');
      const data = await res.json();
      setReport(data);
    } catch (err) {
      console.error('Error fetching analytics forecast:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForecast();
  }, []);

  const handleAskAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;

    try {
      setAiLoading(true);
      const res = await fetch('/api/v1/ai/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      const data = await res.json();
      setAiResponse(data.recommendation);
    } catch (err) {
      setAiResponse('Unable to connect to AI Advisor service.');
    } finally {
      setAiLoading(false);
    }
  };

  if (loading || !report) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-500" />
        <p className="text-sm font-semibold">Generating 24-Hour Time-Series Predictive Occupancy Model...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Peak Occupancy Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-5 rounded-2xl shadow-md border border-slate-800 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center space-x-2 text-blue-400 font-bold text-xs mb-1 font-mono uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>LSTM TIME-SERIES FORECAST MODEL</span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight font-sans">
              Peak Occupancy Projection: <span className="font-mono text-blue-400">{report.peakOccupancyPct}%</span>
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              Estimated peak window expected at <span className="text-amber-400 font-mono font-bold">{report.peakHour}</span> reaching{' '}
              <span className="text-white font-mono font-bold">{report.projectedPeakOccupied} occupied slots</span> out of {report.totalSlots} total capacity.
            </p>
          </div>

          <div className="flex items-center space-x-4 bg-slate-950/80 border border-slate-700/80 rounded-xl p-4 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-widest">Peak Window</span>
              <span className="text-lg font-mono font-bold text-amber-400">{report.peakHour}</span>
            </div>
            <div className="h-8 w-px bg-slate-800"></div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-widest">Max Load</span>
              <span className="text-lg font-mono font-bold text-white">{report.projectedPeakOccupied} Slots</span>
            </div>
          </div>
        </div>
      </div>

      {/* 24-Hour Occupancy Time-Series Forecast Visualizer */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2 font-mono">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              24-Hour Hourly Occupancy Forecast Curve
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">Predictive occupancy rate breakdown across multi-level basements</p>
          </div>

          <div className="flex items-center space-x-3 text-xs font-mono">
            <div className="flex items-center space-x-1.5">
              <div className="w-3 h-3 rounded bg-blue-600"></div>
              <span className="text-slate-700">Total %</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <div className="w-3 h-3 rounded bg-emerald-600"></div>
              <span className="text-slate-700">B1</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <div className="w-3 h-3 rounded bg-indigo-600"></div>
              <span className="text-slate-700">B2</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <div className="w-3 h-3 rounded bg-amber-500"></div>
              <span className="text-slate-700">B3</span>
            </div>
          </div>
        </div>

        {/* Custom Responsive Time Series Bar Chart */}
        <div className="h-64 flex items-end justify-between gap-1 sm:gap-2 pt-6 border-b border-slate-200 px-2 pb-2">
          {report.hourlyForecast.map((item, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
              {/* Tooltip on hover */}
              <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col bg-slate-900 text-white text-[10px] p-2 rounded-lg border border-slate-700 shadow-xl z-20 whitespace-nowrap">
                <span className="font-bold text-blue-400">{item.hour}</span>
                <span>Total: {item.totalOccupancyPct}%</span>
                <span>B1: {item.b1OccupancyPct}% | B2: {item.b2OccupancyPct}%</span>
                <span>Entries: ~{item.expectedEntries} | Exits: ~{item.expectedExits}</span>
              </div>

              {/* Bar container */}
              <div className="w-full max-w-[18px] bg-slate-100 rounded-t overflow-hidden flex flex-col justify-end h-full transition-all border border-slate-200">
                <div
                  className={`w-full transition-all duration-500 ${
                    item.isPeakHour
                      ? 'bg-gradient-to-t from-rose-600 to-amber-500'
                      : item.totalOccupancyPct > 80
                      ? 'bg-gradient-to-t from-blue-600 to-emerald-500'
                      : 'bg-blue-600'
                  }`}
                  style={{ height: `${item.totalOccupancyPct}%` }}
                ></div>
              </div>

              {/* Hour Label */}
              <span className="text-[9px] text-slate-500 mt-2 font-mono rotate-45 sm:rotate-0 origin-left">
                {item.hour}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Floor Breakdown & AI Strategic Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Floor Breakdown Table */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2 font-mono">
            <Layers className="w-4 h-4 text-blue-600" />
            Floor Level Peak Capacities
          </h3>
          <div className="space-y-3 text-xs">
            {report.floorBreakdown.map((floor, idx) => (
              <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1.5 font-mono">
                  <span className="font-bold text-slate-900">{floor.floor}</span>
                  <span className="font-bold text-amber-700">{floor.peakPct}% Peak</span>
                </div>
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mb-2 border border-slate-300">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 to-amber-500 rounded-full"
                    style={{ width: `${floor.peakPct}%` }}
                  ></div>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                  <span>Cap: {floor.totalSlots}</span>
                  <span>Proj Peak: {floor.projectedPeakOccupied} Slots</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Recommendations Panel */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2 font-mono">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Smart PMS Predictive Strategy Recommendations
              </h3>
              <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                AI Powered
              </span>
            </div>

            <div className="space-y-2.5 text-xs mb-4">
              {report.aiRecommendations.map((rec, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-start space-x-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="text-slate-800 leading-relaxed font-medium">{rec}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive AI Query Bar */}
          <form onSubmit={handleAskAi} className="pt-3 border-t border-slate-200">
            <span className="text-[11px] font-bold text-slate-500 block mb-1.5 font-mono uppercase">Ask PMS AI Optimization Advisor</span>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. How to handle EV charging bottleneck during evening exit?"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 font-mono"
              />
              <button
                type="submit"
                disabled={aiLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center space-x-1.5 disabled:opacity-50 shadow-sm"
              >
                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>Ask AI</span>
              </button>
            </div>

            {aiResponse && (
              <div className="mt-3 p-3 bg-blue-50/80 border border-blue-200 rounded-xl text-xs text-slate-800 leading-relaxed font-mono">
                <span className="font-bold text-blue-700 block mb-1">Gemini AI Strategy Advisor Output:</span>
                {aiResponse}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* ANPR Camera Health Status Grid */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2 font-mono">
            <Camera className="w-4 h-4 text-emerald-600" />
            ANPR OCR Camera Network Health (12 Live Gate & Stacker Streams)
          </h3>
          <span className="text-xs font-mono font-semibold text-emerald-700 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]"></span>
            All 12 Cameras Active
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          {[
            { id: 'G-ANPR-CAM01', loc: 'Main Entry Gate 1', fps: '30 FPS', lat: '12ms' },
            { id: 'G-ANPR-CAM02', loc: 'Main Entry Gate 2', fps: '30 FPS', lat: '14ms' },
            { id: 'B1-CAM-EV', loc: 'B1 EV Charging Hub', fps: '25 FPS', lat: '18ms' },
            { id: 'B1-CAM-VIP', loc: 'B1 VIP High Bay', fps: '25 FPS', lat: '15ms' },
            { id: 'B2-CAM-BAY1', loc: 'B2 Stacker Aisle 1', fps: '25 FPS', lat: '16ms' },
            { id: 'B2-CAM-BAY2', loc: 'B2 Two-Wheeler Gate', fps: '30 FPS', lat: '11ms' },
            { id: 'B3-CAM-FLEET', loc: 'B3 Corporate Shuttle', fps: '25 FPS', lat: '19ms' },
            { id: 'B3-CAM-P01', loc: 'B3 Puzzle Stacker', fps: '25 FPS', lat: '21ms' },
            { id: 'G-EXIT-CAM01', loc: 'North Exit Gate 1', fps: '30 FPS', lat: '10ms' },
            { id: 'G-EXIT-CAM02', loc: 'North Exit Gate 2', fps: '30 FPS', lat: '12ms' },
            { id: 'DRV-CAM-ANPR', loc: 'Perimeter Driveway', fps: '25 FPS', lat: '22ms' },
            { id: 'VIP-CAM-ANPR', loc: 'Executive Drop-off', fps: '30 FPS', lat: '11ms' },
          ].map((cam) => (
            <div key={cam.id} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono font-bold text-slate-900 text-[11px]">{cam.id}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              </div>
              <span className="text-[10px] text-slate-500 block truncate">{cam.loc}</span>
              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-200 text-[9px] text-slate-500 font-mono">
                <span>{cam.fps}</span>
                <span className="text-emerald-700 font-bold">{cam.lat}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
