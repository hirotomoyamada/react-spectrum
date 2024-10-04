/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import {act, waitFor, within} from '@testing-library/react';
import {MenuTesterOpts, UserOpts} from './types';
import {triggerLongPress} from './events';

interface MenuOpenOpts {
  /**
   * Whether the menu needs to be long pressed to open.
   */
  needsLongPress?: boolean,
  /**
   * What interaction type to use when opening the menu. Defaults to the interaction type set on the tester.
   */
  interactionType?: UserOpts['interactionType']
}

interface MenuSelectOpts extends MenuOpenOpts {
  /**
   * The option node to select. Option nodes can be sourced via `options()`.
   */
  option?: HTMLElement,
  /**
   * The text of the node to look for when selecting a option. Alternative to `option`.
   */
  optionText?: string,
  /**
   * The menu's selection mode. Will affect whether or not the menu is expected to be closed upon option selection.
   * @default 'single'
   */
  menuSelectionMode?: 'single' | 'multiple',
  /**
   * Whether or not the menu closes on select. Depends on menu implementation and configuration.
   * @default true
   */
  closesOnSelect?: boolean
}

interface MenuOpenSubmenuOpts extends MenuOpenOpts {
  /**
   * The submenu trigger to open. Available submenu trigger nodes can be sourced via `submenuTriggers`.
   */
  submenuTrigger?: HTMLElement,
  /**
   * The text of submenu trigger to open. Alternative to `submenuTrigger`.
   */
  submenuTriggerText?: string
}

export class MenuTester {
  private user;
  private _interactionType: UserOpts['interactionType'];
  private _advanceTimer: UserOpts['advanceTimer'];
  private _trigger: HTMLElement;

  constructor(opts: MenuTesterOpts) {
    let {root, user, interactionType, advanceTimer} = opts;
    this.user = user;
    this._interactionType = interactionType || 'mouse';
    this._advanceTimer = advanceTimer;

    // Handle case where a submenu trigger is provided to the tester
    if (root.getAttribute('role') === 'menuitem') {
      this._trigger = root;
    } else {
      // Handle case where element provided is a wrapper of the trigger button
      let trigger = within(root).queryByRole('button');
      if (trigger) {
        this._trigger = trigger;
      } else {
        this._trigger = root;
      }
    }
  }

  /**
   * Set the interaction type used by the menu tester.
   */
  setInteractionType(type: UserOpts['interactionType']) {
    this._interactionType = type;
  }

  // TODO: this has been common to select as well, maybe make select use it? Or make a generic method. Will need to make error messages generic
  // One difference will be that it supports long press as well
  /**
   * Opens the menu. Defaults to using the interaction type set on the menu tester.
   */
  async open(opts: MenuOpenOpts = {}) {
    let {
      needsLongPress,
      interactionType = this._interactionType
    } = opts;

    let trigger = this.trigger;
    let isDisabled = trigger.hasAttribute('disabled');
    if (interactionType === 'mouse' || interactionType === 'touch') {
      if (needsLongPress) {
        if (this._advanceTimer == null) {
          throw new Error('No advanceTimers provided for long press.');
        }
        let pointerType = interactionType === 'mouse' ? 'mouse' : 'touch';
        await triggerLongPress({element: trigger, advanceTimer: this._advanceTimer, pointerOpts: {pointerType}});
      } else if (interactionType === 'mouse') {
        await this.user.click(trigger);
      } else {
        await this.user.pointer({target: trigger, keys: '[TouchA]'});
      }
    } else if (interactionType === 'keyboard' && !isDisabled) {
      act(() => trigger.focus());
      await this.user.keyboard('[Enter]');
    }

    await waitFor(() => {
      if (trigger.getAttribute('aria-controls') == null && !isDisabled) {
        throw new Error('No aria-controls found on menu trigger element.');
      } else {
        return true;
      }
    });
    if (!isDisabled) {
      let menuId = trigger.getAttribute('aria-controls');
      await waitFor(() => {
        if (!menuId || document.getElementById(menuId) == null) {
          throw new Error(`Menu with id of ${menuId} not found in document.`);
        } else {
          return true;
        }
      });
    }
  }

  // TODO: also very similar to select, barring potential long press support
  // Close on select is also kinda specific?
  /**
   * Selects the desired menu option. Defaults to using the interaction type set on the menu tester. If necessary, will open the menu dropdown beforehand.
   * The desired option can be targeted via the option's node or the option's text.
   */
  async selectOption(opts: MenuSelectOpts) {
    let {
      optionText,
      menuSelectionMode = 'single',
      needsLongPress,
      closesOnSelect = true,
      option,
      interactionType = this._interactionType
    } = opts;
    let trigger = this.trigger;
    if (!trigger.getAttribute('aria-controls')) {
      await this.open({needsLongPress});
    }

    let menu = this.menu;
    if (menu) {
      if (!option && optionText) {
        option = within(menu).getByText(optionText);
      }

      if (interactionType === 'keyboard') {
        if (document.activeElement !== menu || !menu.contains(document.activeElement)) {
          act(() => menu.focus());
        }

        await this.user.keyboard(optionText);
        await this.user.keyboard('[Enter]');
      } else {
        if (interactionType === 'mouse') {
          await this.user.click(option);
        } else {
          await this.user.pointer({target: option, keys: '[TouchA]'});
        }
      }

      if (option && option.getAttribute('href') == null && option.getAttribute('aria-haspopup') == null && menuSelectionMode === 'single' && closesOnSelect) {
        await waitFor(() => {
          if (document.activeElement !== trigger) {
            throw new Error(`Expected the document.activeElement after selecting an option to be the menu trigger but got ${document.activeElement}`);
          } else {
            return true;
          }
        });

        if (document.contains(menu)) {
          throw new Error('Expected menu element to not be in the document after selecting an option');
        }
      }
    } else {
      throw new Error("Attempted to select a option in the menu, but menu wasn't found.");
    }
  }

  // TODO: update this to remove needsLongPress if we wanna make the user call open first always
  /**
   * Opens the submenu. Defaults to using the interaction type set on the menu tester. The submenu trigger can be targeted via the trigger's node or the trigger's text.
   */
  async openSubmenu(opts: MenuOpenSubmenuOpts): Promise<MenuTester | null> {
    let {
      submenuTrigger,
      submenuTriggerText,
      needsLongPress,
      interactionType = this._interactionType
    } = opts;
    let trigger = this.trigger;
    let isDisabled = trigger.hasAttribute('disabled');
    if (!trigger.getAttribute('aria-controls') && !isDisabled) {
      await this.open({needsLongPress});
    }
    if (!isDisabled) {
      let menu = this.menu;
      if (menu) {
        let submenu;
        if (submenuTrigger) {
          submenu = submenuTrigger;
        } else if (submenuTriggerText) {
          submenu = within(menu).getByText(submenuTriggerText);
        }

        let submenuTriggerTester = new MenuTester({user: this.user, interactionType: interactionType, root: submenu});
        await submenuTriggerTester.open();

        return submenuTriggerTester;
      }
    }

    return null;
  }

  /**
   * Closes the menu.
   */
  async close() {
    let menu = this.menu;
    if (menu) {
      act(() => menu.focus());
      await this.user.keyboard('[Escape]');

      await waitFor(() => {
        if (document.activeElement !== this.trigger) {
          throw new Error(`Expected the document.activeElement after closing the menu to be the menu trigger but got ${document.activeElement}`);
        } else {
          return true;
        }
      });

      if (document.contains(menu)) {
        throw new Error('Expected the menu to not be in the document after closing it.');
      }
    }
  }

  /**
   * Returns the menu's trigger.
   */
  get trigger(): HTMLElement {
    return this._trigger;
  }

  /**
   * Returns the menu if present.
   */
  get menu(): HTMLElement | null {
    let menuId = this.trigger.getAttribute('aria-controls');
    return menuId ? document.getElementById(menuId) : null;
  }

  /**
   * Returns the menu's sections if any.
   */
  get sections(): HTMLElement[] {
    let menu = this.menu;
    if (menu) {
      return within(menu).queryAllByRole('group');
    } else {
      return [];
    }
  }

  /**
   * Returns the menu's options if present. Can be filtered to a subsection of the menu if provided via `element`.
   */
  options(opts: {element?: HTMLElement} = {}): HTMLElement[] {
    let {element = this.menu} = opts;
    let options = [];
    if (element) {
      options = within(element).queryAllByRole('menuitem');
      if (options.length === 0) {
        options = within(element).queryAllByRole('menuitemradio');
        if (options.length === 0) {
          options = within(element).queryAllByRole('menuitemcheckbox');
        }
      }
    }

    return options;
  }

  /**
   * Returns the menu's submenu triggers if any.
   */
  get submenuTriggers(): HTMLElement[] {
    let options = this.options();
    if (options.length > 0) {
      return options.filter(item => item.getAttribute('aria-haspopup') != null);
    }

    return [];
  }
}
