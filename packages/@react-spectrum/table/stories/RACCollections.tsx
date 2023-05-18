import {CellProps, Collection, ColumnProps, RowProps, TableBodyProps, TableHeaderProps} from 'react-aria-components';
import {
  CollectionContext,
  CollectionRendererContext,
  useCollectionChildren
} from 'react-aria-components/src/Collection';
import {useTablePropsContext} from '../src/TableView';
import React, {useContext, useMemo} from 'react';


export function BaseTableHeader<T extends object>(props: TableHeaderProps<T>) {
  let children = useCollectionChildren({
    children: props.children,
    items: props.columns
  });

  let renderer = typeof props.children === 'function' ? props.children : null;
  return (
    <CollectionRendererContext.Provider value={renderer}>
      {/* @ts-ignore */}
      <tableheader multiple={props}>
        {children}
        {/* @ts-ignore */}
      </tableheader>
    </CollectionRendererContext.Provider>
  );
}

export function TableHeader<T extends object>(props: TableHeaderProps<T>) {
  let {
    selectionMode,
    allowsDragging,
    shouldShowCheckboxes
  } = useTablePropsContext();

  return (
    <BaseTableHeader id={props.id}>
      { /*Add extra columns for drag and drop and selection. */ }
      {allowsDragging && <Column isDragButtonCell />}
      {shouldShowCheckboxes && (!!selectionMode && selectionMode !== 'none') &&  (
        <Column isSelectionCell />
      )}
      <Collection items={props.columns}>
        {props.children}
      </Collection>
    </BaseTableHeader>
  );
}

export function TableHeaderRow(props) {
  let children = useCollectionChildren({
    children: props.children,
    items: props.columns
  });

  // @ts-ignore
  return <headerrow multiple={props}>{children}</headerrow>;
}

export function Column<T extends object>(props: ColumnProps<T>): JSX.Element {
  let render = useContext(CollectionRendererContext);
  let childColumns = typeof render === 'function' ? render : props.children;
  let children = useCollectionChildren({
    children: (props.title || props.childColumns) ? childColumns : null,
    items: props.childColumns
  });

  // @ts-ignore
  return <column multiple={{...props, rendered: props.title ?? props.children}}>{children}</column>;
}

// TODO: add columns to prop type if we wanna go this route. Bit wary of using columns as a dep
export function TableBody<T extends object>(props: TableBodyProps<T>) {
  let children = useCollectionChildren(props, [props.columns]);

  // @ts-ignore
  return <tablebody multiple={props}>{children}</tablebody>;
}


export function BaseRow<T extends object>(props: RowProps<T>) {
  let children = useCollectionChildren({
    children: props.children,
    items: props.columns,
    idScope: props.id
  });

  let ctx = useMemo(() => ({idScope: props.id}), [props.id]);

  return (
    // @ts-ignore
    <item multiple={props}>
      <CollectionContext.Provider value={ctx}>
        {children}
      </CollectionContext.Provider>
      {/* @ts-ignore */}
    </item>
  );
}

export function Row<T extends object>({ id, columns, children }: RowProps<T>) {
  let {
    selectionMode,
    allowsDragging,
    shouldShowCheckboxes
  } = useTablePropsContext();

  // TODO: perhaps we can cycle though columns and construct our leaf elements?
  return (
    <BaseRow id={id}>
      {allowsDragging && (
        <Cell isDragButtonCell />
      )}
      {shouldShowCheckboxes && (!!selectionMode && selectionMode !== 'none') && (
        <Cell isSelectionCell />
      )}
      <Collection items={columns}>
        {children}
      </Collection>
    </BaseRow>
  );
}

export function Cell(props: CellProps): JSX.Element {
  // @ts-ignore
  return <cell multiple={{...props, rendered: props.children}} />;
}
