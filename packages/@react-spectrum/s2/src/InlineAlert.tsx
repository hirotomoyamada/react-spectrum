/*
 * Copyright 2023 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import AlertTriangle from '../s2wf-icons/assets/react/s2IconAlertTriangle20N';
import CheckmarkCircle from '../s2wf-icons/assets/react/s2IconCheckmarkCircle20N';
import {DOMProps, DOMRef, StyleProps} from '@react-types/shared';
import {filterDOMProps} from '@react-aria/utils';
import {focusRing} from './style-utils' with {type: 'macro'};
import InfoCircle from '../s2wf-icons/assets/react/s2IconInfoCircle20N';
import {mergeStyles} from '../style-macro/runtime';
import React, {ReactNode, useEffect, useRef} from 'react';
import {SlotProvider, useDOMRef} from '@react-spectrum/utils';
import {style} from '../style-macro/spectrum-theme' with {type: 'macro'};
import {useFocusRing} from 'react-aria';

export interface SpectrumInlineAlertProps extends DOMProps, StyleProps, InlineStylesProps {
  /**
   * The contents of the Inline Alert.
   */
  children: ReactNode,
  /**
   * Whether to automatically focus the Inline Alert when it first renders.
   */
  autoFocus?: boolean
}

interface InlineStylesProps {
  /**
   * The semantic tone of a Inline Alert. 
   * @default neutral
   */
  variant?: 'informative' | 'positive' | 'notice' | 'negative' | 'neutral',
  /**
   * The visual style of the Inline Alert.
   * @default border
   */
  style?: 'border' | 'subtleFill' | 'boldFill'
}

const inlineAlert = style<InlineStylesProps & {isFocusVisible?: boolean}>({
  ...focusRing(),
  display: 'inline-block',
  position: 'relative',
  boxSizing: 'border-box',
  maxWidth: 80,
  fontSize: 'base',
  fontFamily: 'sans',
  padding: 6,
  borderRadius: 'lg',
  borderStyle: 'solid',
  borderWidth: 2,
  borderColor: {
    style: {
      border: {
        variant: {
          informative: 'informative-800',
          positive: 'positive-700',
          notice: 'notice-700',
          negative: 'negative-800',
          neutral: 'gray-700' // is there a semantic color name for neutral?
        }
      },
      subtleFill: 'transparent',
      boldFill: 'transparent'
    }
  },
  backgroundColor: {
    variant: {
      informative: {
        style: {
          border: 'gray-25',
          subtleFill: 'informative-200',
          boldFill: 'informative'
        }
      },
      positive: {
        style: {
          border: 'gray-25',
          subtleFill: 'positive-200',
          boldFill: 'positive'
        }
      },
      notice: {
        style: {
          border: 'gray-25',
          subtleFill: 'notice-200',
          boldFill: 'notice' // TODO: check with design since this doesn't pass contrast in dark mode
        }
      },
      negative: {
        style: {
          border: 'gray-25',
          subtleFill: 'negative-200',
          boldFill: 'negative'
        }
      },
      neutral: {
        style: {
          border: 'gray-25',
          subtleFill: 'gray-100',
          boldFill: 'neutral-subdued'
        }
      }
    }
  }
});

const icon = style<InlineStylesProps>({
  gridArea: 'icon',
  fill: {
    default: {
      variant: {
        informative: 'blue-800', // TODO: update semantic aliases for icon colors after devon's PR is merged in 
        positive: 'green-700',
        notice: 'orange-700',
        negative: 'red-800'
      }
    },
    style: {
      boldFill: 'transparent-white-900'
    },
    forcedColors: 'ButtonText'
  }
});

const grid = style<InlineStylesProps>({
  display: 'grid',
  columnGap: 6,
  gridTemplateColumns: '1fr auto',
  gridTemplateRows: 'auto auto auto',
  width: 'full',
  gridTemplateAreas: [
    'heading icon',
    'content content'
  ]
});

let ICONS = {
  informative: InfoCircle,
  positive: CheckmarkCircle,
  notice: AlertTriangle,
  negative: AlertTriangle,
  neutral: undefined
};

function InlineAlert(props: SpectrumInlineAlertProps, ref: DOMRef<HTMLDivElement>) {
  let {
    children,
    variant = 'neutral',
    style: styleFill = 'border',
    autoFocus
  } = props;

  let domRef = useDOMRef(ref);

  let slots = {
    heading: {UNSAFE_className: style({
      marginTop: 0, 
      color: {
        style: {
          border: 'gray-900',
          subtleFill: 'gray-900',
          boldFill: 'transparent-white-900'
        }
      }, 
      gridArea: 'heading'})({variant, style: styleFill})
    },
    content: {UNSAFE_className: style({
      color: {
        style: {
          border: 'gray-900',
          subtleFill: 'gray-800',
          boldFill: 'transparent-white-800'
        } 
      },
      gridArea: 'content'})({variant, style: styleFill})
    }
  };

  let Icon = null;
  let iconAlt = '';
  if (variant in ICONS) {
    Icon = ICONS[variant];
    iconAlt = variant;
  }

  let {isFocusVisible, focusProps} = useFocusRing({autoFocus: props.autoFocus});
  let autoFocusRef = useRef(props.autoFocus);
  useEffect(() => {
    if (autoFocusRef.current && domRef.current) {
      domRef.current.focus();
    }
    autoFocusRef.current = false;
  }, [domRef]);

  return (
    <div
      {...filterDOMProps(props)}
      {...focusProps}
      ref={domRef}
      tabIndex={autoFocus ? -1 : undefined}
      autoFocus={autoFocus}
      role="alert"
      className={mergeStyles(props.UNSAFE_className, inlineAlert({
        variant,
        style: styleFill,
        isFocusVisible
      }))}>
      <div 
        className={grid({...props})}>
        <SlotProvider slots={slots}>
          {Icon && <Icon
            className={icon({...props})}
            aria-label={iconAlt} />}
          {children}
        </SlotProvider>
      </div>
    </div>
  );
}

/**
 * Inline alerts display a non-modal message associated with objects in a view.
 * These are often used in form validation, providing a place to aggregate feedback related to multiple fields.
 */
const _InlineAlert = React.forwardRef(InlineAlert);
export {_InlineAlert as InlineAlert};