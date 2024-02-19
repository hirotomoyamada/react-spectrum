import {ActionButton} from '../src/ActionButton';
import {Divider} from '../src/Divider';
import {Icon} from '../src/Icon';
import NewIcon from '../s2wf-icons/assets/react/s2IconNew20N';
import {style} from '../style-macro/spectrum-theme' with {type: 'macro'};

import type {Meta} from '@storybook/react';

const meta: Meta<typeof Divider> = {
  component: Divider,
  parameters: {
    layout: 'centered'
  },
  tags: ['autodocs']
};

export default meta;

export const Example = {
  render: (args: any) => (
    <section
      className={style({
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: 2,
        color: 'neutral',
        backgroundColor: {
          staticColor: {
            black: {default: 'yellow-400', dark: 'yellow-1100'},
            white: {default: 'blue-900', dark: 'blue-500'}
          }
        }
      })({staticColor: args.staticColor})}>
      <h1>Buttons</h1>
      <Divider {...args} />
      <section style={{display: 'flex', gap: '5px'}}>
        <ActionButton aria-label="fake button, new icon, no action" size="M" staticColor={args.staticColor}><Icon><NewIcon /></Icon></ActionButton>
        <Divider {...args} />
        <ActionButton aria-label="fake button, new icon, no action" size="M" staticColor={args.staticColor}><Icon><NewIcon /></Icon></ActionButton>
      </section>
    </section>
  ),
  parameters: {
    design: {
      type: 'figma',
      url: 'https://www.figma.com/file/Mngz9H7WZLbrCvGQf3GnsY/S2-%2F-Desktop?node-id=13642%3A359'
    }
  }
};
