
import { Chart as ChartJS } from 'chart.js';
import 'chartjs-adapter-date-fns';

// Register ChartJS components globally
import {
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  BarElement
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

// Common chart colors
export const CHART_COLORS = {
  primary: 'rgb(75, 192, 192)',
  secondary: 'rgb(54, 162, 235)',
  warning: 'rgb(255, 205, 86)',
  danger: 'rgb(255, 99, 132)',
  success: 'rgb(75, 192, 192)',
  purple: 'rgb(153, 102, 255)',
  orange: 'rgb(255, 159, 64)',
};

// Common chart options
export const commonOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top',
    },
    tooltip: {
      mode: 'index',
      intersect: false,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      titleColor: 'white',
      bodyColor: 'white',
      borderColor: 'white',
      borderWidth: 1,
    },
  },
};

// Time formats for different ranges
export const timeFormats = {
  day: {
    unit: 'hour',
    tooltipFormat: 'PP p',
    displayFormats: {
      hour: 'ha'
    }
  },
  week: {
    unit: 'day',
    tooltipFormat: 'PP',
    displayFormats: {
      day: 'MMM d'
    }
  },
  month: {
    unit: 'day',
    tooltipFormat: 'PP',
    displayFormats: {
      day: 'MMM d'
    }
  }
};