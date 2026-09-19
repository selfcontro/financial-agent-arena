import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
export function Modal({title,close,children}:{title:string;close:()=>void;children:ReactNode}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog ref={dialog} onCancel={e=>{e.preventDefault();close();}} aria-label={title}><div className="modal-head"><h2>{title}</h2><button onClick={close} aria-label="关闭弹窗">×</button></div>{children}</dialog>;
}

