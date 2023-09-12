/*
 * Copyright 2020 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import {classNames, useDOMRef, useStyleProps} from '@react-spectrum/utils';
import {DOMRef} from '@react-types/shared';
import {FocusScope} from '@react-aria/focus';
import {MenuContext, MenuStateContext, useMenuStateContext} from './context';
import {MenuItem} from './MenuItem';
import {MenuSection} from './MenuSection';
import {mergeProps, useLayoutEffect, useSyncRef} from '@react-aria/utils';
import React, {ReactElement, useContext, useRef, useState} from 'react';
import {SpectrumMenuProps} from '@react-types/menu';
import styles from '@adobe/spectrum-css-temp/components/menu/vars.css';
import {useMenu} from '@react-aria/menu';
import {useTreeState} from '@react-stately/tree';

function Menu<T extends object>(props: SpectrumMenuProps<T>, ref: DOMRef<HTMLUListElement>) {
  let contextProps = useContext(MenuContext);
  let parentMenuContext = useMenuStateContext();
  let {menuTreeState} = parentMenuContext || {};
  if (!parentMenuContext) {
    menuTreeState = contextProps.menuTreeState;
  }
  let completeProps = {
    ...mergeProps(contextProps, props)
  };
  let domRef = useDOMRef(ref);
  let scopedRef = useRef(null);
  let state = useTreeState(completeProps);
  let {menuProps} = useMenu(completeProps, state, domRef);
  let {styleProps} = useStyleProps(completeProps);
  useSyncRef(contextProps, domRef);

  let [leftOffset, setLeftOffset] = useState({left: 0});
  useLayoutEffect(() => {
    let {left} = scopedRef.current.getBoundingClientRect();
    setLeftOffset({left: -1 * left});
  }, []);

  // TODO: think about if passing the level down is the best way to figure out if the current menu has an expanded submenu for containment purposes.
  // I could instead still leverage treestate and expanded keys by passing the tree state into useSubMenuTriggerState and calling
  // state.setExpandedKeys on open/close but that feels iffy since we don't use expandedKeys at all anymore
  // TODO: The logic behind this is that every submenu with its own submenu should have contain=true. This is so we can tab between the submenutrigger and the submenu
  let level = completeProps.level ?? 0;
  let hasOpenSubMenu = level === 0 ? menuTreeState?.expandedKeysStack.length > 0 : state.collection.getItem(menuTreeState.expandedKeysStack[level]) != null;
  return (
    <MenuStateContext.Provider value={{container: scopedRef, menu: domRef, menuTreeState}}>
      <FocusScope contain={hasOpenSubMenu}>
        <div style={{overflow: 'hidden', maxHeight: '100%', display: 'inline-flex', borderRadius: 'var(--spectrum-alias-border-radius-regular)'}}>
          <ul
            {...menuProps}
            {...styleProps}
            ref={domRef}
            className={
              classNames(
                styles,
                'spectrum-Menu',
                styleProps.className
              )
            }>
            {[...state.collection].map(item => {
              if (item.type === 'section') {
                return (
                  <MenuSection
                    key={item.key}
                    item={item}
                    state={state}
                    onAction={completeProps.onAction} />
                );
              }

              let menuItem = (
                <MenuItem
                  key={item.key}
                  item={item}
                  state={state}
                  onAction={completeProps.onAction} />
              );

              if (item.wrapper) {
                menuItem = item.wrapper(menuItem);
              }

              return menuItem;
            })}
          </ul>
        </div>
        {/* Make the portal container for submenus wide enough so that the submenu items can render as wide as they need to be */}
        <div ref={scopedRef} style={{width: '100vw', position: 'absolute', top: 0, ...leftOffset}} />
      </FocusScope>
    </MenuStateContext.Provider>
  );
}

/**
 * Menus display a list of actions or options that a user can choose.
 */
// forwardRef doesn't support generic parameters, so cast the result to the correct type
// https://stackoverflow.com/questions/58469229/react-with-typescript-generics-while-using-react-forwardref
const _Menu = React.forwardRef(Menu) as <T>(props: SpectrumMenuProps<T> & {ref?: DOMRef<HTMLUListElement>}) => ReactElement;
export {_Menu as Menu};
