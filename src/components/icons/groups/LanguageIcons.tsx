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

export const IconPyodide: React.FC<IconProps> = ({ size = defaultSize, className, color }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 182 182"
    fill="none"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect x="107" y="125" width="50" height="32" fill="#FFFFFF" />
    <path
      fill="#654FF0"
      d="m 135.18,97 c 0,-0.13 -0.01,-7.24 -0.02,-7.37 h 27.51 v 71.33 H 91.33 V 89.63 h 27.51 c 0,0.13 -0.02,7.24 -0.02,7.37 m 32.59,56.33 h 4.9 l -7.43,-25.25 h -7.45 l -6.12,25.25 h 4.75 l 1.24,-5.62 h 8.49 l 1.61,5.62 z m -26.03,0 h 4.69 l 6.02,-25.25 h -4.63 l -3.69,17.4 h -0.06 l -3.5,-17.4 h -4.42 l -3.9,17.19 h -0.06 l -3.23,-17.19 h -4.72 l 5.44,25.25 h 4.78 l 3.75,-17.19 h 0.06 z m 18.89,-19.03 h 1.99 l 2.37,9.27 h -6.42 z"
    />
    <g fill={color ?? 'currentColor'}>
      <path d="m 89,49.66 c 0,10.6 -8.8,20 -20,20 H 29 v 20 H 19 v -70 h 50 c 10.7,0 19.7,8.9 20,20 z m -10,-10 c 0,-5.5 -4.5,-10 -10,-10 H 29 v 30 h 40 c 5.5,0 10,-4.5 10,-10 z" />
      <path d="m 132,67.66 v 22 h -10 v -22 l -30,-33 v -15 h 10 v 10.9 l 25,27.5 25,-27.5 v -10.9 h 10 v 15 z" />
    </g>
  </svg>
);
