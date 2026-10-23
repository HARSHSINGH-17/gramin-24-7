/**
 * Clinical and presentation configuration for RPM time-series vitals
 */
export const VITAL_CONFIGS = {
  heart_rate: {
    label: 'Heart Rate',
    unit: 'bpm',
    color: '#0d9488',
    defaultMin: 40,
    defaultMax: 120,
  },
  oxygen_saturation: {
    label: 'SpO₂',
    unit: '%',
    color: '#2563eb',
    defaultMin: 92,
    defaultMax: null,
  },
  body_temperature: {
    label: 'Temperature',
    unit: '°C',
    color: '#f59e0b',
    defaultMin: 35.0,
    defaultMax: 38.0,
  },
  blood_pressure: {
    label: 'Blood Pressure',
    unit: 'mmHg',
    color: '#7c3aed',
    isDual: true,
    sysConfig: { label: 'Systolic', color: '#2563eb', defaultMin: 90, defaultMax: 180 },
    diaConfig: { label: 'Diastolic', color: '#0d9488', defaultMin: 60, defaultMax: 120 },
  },
}
