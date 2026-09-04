import React from 'react';
import { type IconProps, defaultSize } from '@/components/icons/iconPrimitives';

export const IconHtml5: React.FC<IconProps> = ({ size = defaultSize, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 512 512"
    fill="none"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path fill="#E34F26" d="M71,460 L30,0 481,0 440,460 255,512" />
    <path fill="#EF652A" d="M256,472 L405,431 440,37 256,37" />
    <path
      fill="#EBEBEB"
      d="M256,208 L181,208 176,150 256,150 256,94 255,94 114,94 115,109 129,265 256,265zM256,355 L255,355 192,338 188,293 132,293 139,382 256,414z"
    />
    <path
      fill="#FFFFFF"
      d="M255,208 L255,265 325,265 318,338 255,355 255,414 371,382 372,372 385,223 387,208zM256,94 L256,129 256,150 256,150 389,150 390,150 391,150 392,150 393,150 396,109 397,94z"
    />
  </svg>
);

export const IconPython: React.FC<IconProps> = ({ size = defaultSize, className }) => {
  const gradientSeed = React.useId().replace(/:/g, '');
  const blueGradientId = `python-blue-${gradientSeed}`;
  const yellowGradientId = `python-yellow-${gradientSeed}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="-15 0 140 140"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={blueGradientId} x1="24" y1="10" x2="84" y2="67" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5a9fd4" />
          <stop offset="1" stopColor="#306998" />
        </linearGradient>
        <linearGradient id={yellowGradientId} x1="86" y1="130" x2="26" y2="72" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffd43b" />
          <stop offset="1" stopColor="#ffe873" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${blueGradientId})`}
        d="M54.9188 0C50.3351 0.0213 45.9578 0.4122 42.1063 1.09375C30.7601 3.09825 28.7001 7.29385 28.7001 15.0312V25.25H55.5126V28.6562H28.7001H18.6376C10.8451 28.6562 4.02184 33.3399 1.8876 42.25C-0.57422 52.4629 -0.68341 58.8351 1.8876 69.5C3.79353 77.4378 8.34514 83.0938 16.1376 83.0938H25.3563V70.8438C25.3563 61.9938 33.0134 54.1875 42.1063 54.1875H68.8876C76.3426 54.1875 82.2939 48.0493 82.2938 40.5625V15.0312C82.2938 7.76491 76.1638 2.30747 68.8876 1.09375C64.2815 0.326257 59.5024 -0.0212988 54.9188 0ZM40.4188 8.21875C43.1883 8.21875 45.4501 10.5164 45.4501 13.3438C45.4501 16.1601 43.1883 18.4375 40.4188 18.4375C37.6393 18.4375 35.3876 16.1601 35.3876 13.3438C35.3876 10.5164 37.6393 8.21875 40.4188 8.21875Z"
      />
      <path
        fill={`url(#${yellowGradientId})`}
        d="M85.6376 28.6562V40.5625C85.6376 49.7943 77.8117 57.5625 68.8876 57.5625H42.1063C34.7704 57.5625 28.7001 63.841 28.7001 71.1875V96.7188C28.7001 103.985 35.0186 108.259 42.1063 110.344C50.5936 112.839 58.7313 113.29 68.8876 110.344C75.6378 108.39 82.2939 104.457 82.2938 96.7188V86.5H55.5126V83.0938H82.2938H95.7C103.492 83.0938 106.396 77.6576 109.106 69.5C111.905 61.1009 111.786 53.0242 109.106 42.25C107.18 34.4926 103.502 28.6562 95.7 28.6562H85.6376ZM70.5751 93.3125C73.3546 93.3125 75.6063 95.5891 75.6063 98.4062C75.6063 101.233 73.3546 103.531 70.5751 103.531C67.8055 103.531 65.5438 101.233 65.5438 98.4062C65.5438 95.5891 67.8055 93.3125 70.5751 93.3125Z"
      />
    </svg>
  );
};
