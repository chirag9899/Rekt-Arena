"use client";
import React from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { cn } from "@/lib/utils";

export const FloatingDock = ({
  items,
  desktopClassName,
  mobileClassName,
  activeItem,
}: {
  items: { title: string; icon: React.ReactNode; href: string; onClick?: (e: React.MouseEvent) => void }[];
  desktopClassName?: string;
  mobileClassName?: string;
  activeItem?: string;
}) => {
  return (
    <>
      <FloatingDockMobile items={items} className={mobileClassName} activeItem={activeItem} />
      <FloatingDockDesktop items={items} className={desktopClassName} activeItem={activeItem} />
    </>
  );
};

const FloatingDockMobile = ({
  items,
  className,
  activeItem,
}: {
  items: { title: string; icon: React.ReactNode; href: string; onClick?: (e: React.MouseEvent) => void }[];
  className?: string;
  activeItem?: string;
}) => {
  return (
    <div
      className={cn(
        "fixed bottom-8 left-0 right-0 z-50 mx-auto w-fit md:hidden",
        className
      )}
    >
      <div className="flex items-center gap-4 rounded-full border border-terminal-border bg-terminal-card/80 backdrop-blur-xl p-2 shadow-lg">
        {items.map((item, idx) => {
          const isActive = activeItem === item.title.toLowerCase().replace(/\s+/g, '-');
          return (
            <a
              key={idx}
              href={item.href}
              onClick={item.onClick}
              className={cn(
                "relative flex h-12 w-12 items-center justify-center rounded-full transition-colors",
                isActive
                  ? "bg-terminal-accent text-foreground"
                  : "bg-terminal-elevated text-terminal-muted hover:bg-terminal-border hover:text-foreground"
              )}
            >
              {item.icon}
              <span className="sr-only">{item.title}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
};

const FloatingDockDesktop = ({
  items,
  className,
  activeItem,
}: {
  items: { title: string; icon: React.ReactNode; href: string; onClick?: (e: React.MouseEvent) => void }[];
  className?: string;
  activeItem?: string;
}) => {
  let mouseX = useMotionValue(Infinity);
  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={cn(
        "fixed bottom-8 left-1/2 z-50 hidden -translate-x-1/2 md:flex",
        className
      )}
    >
      <div className="flex items-end gap-4 rounded-full border border-terminal-border bg-terminal-card/80 backdrop-blur-xl p-2 shadow-lg">
        {items.map((item, idx) => (
          <IconContainer mouseX={mouseX} key={idx} {...item} activeItem={activeItem} />
        ))}
      </div>
    </motion.div>
  );
};

function IconContainer({
  mouseX,
  title,
  icon,
  href,
  onClick,
  activeItem,
}: {
  mouseX: any;
  title: string;
  icon: React.ReactNode;
  href: string;
  onClick?: (e: React.MouseEvent) => void;
  activeItem?: string;
}) {
  let ref = React.useRef<HTMLDivElement>(null);

  let distance = useTransform(mouseX, (val) => {
    let bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };

    return val - bounds.x - bounds.width / 2;
  });

  let widthTransform = useTransform(distance, [-150, 0, 150], [40, 80, 40]);
  let heightTransform = useTransform(distance, [-150, 0, 150], [40, 80, 40]);

  let width = useSpring(widthTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });
  let height = useSpring(heightTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  const [isHovered, setIsHovered] = React.useState(false);
  const isActive = activeItem === title.toLowerCase().replace(/\s+/g, '-');

  return (
    <a href={href} onClick={onClick}>
      <motion.div
        ref={ref}
        style={{ width, height }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          "relative flex aspect-square items-center justify-center rounded-full transition-colors cursor-pointer",
          isActive
            ? "bg-terminal-accent text-foreground"
            : "bg-terminal-elevated text-terminal-muted hover:bg-terminal-border hover:text-foreground"
        )}
      >
        <div className="relative z-10">{icon}</div>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 10, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            className="absolute -top-12 left-1/2 z-50 whitespace-nowrap rounded-md border border-terminal-border bg-terminal-card px-3 py-1 text-xs text-foreground shadow-lg"
          >
            {title}
          </motion.div>
        )}
      </motion.div>
    </a>
  );
}
