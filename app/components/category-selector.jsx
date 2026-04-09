import { motion } from "motion/react";
import { Music, Palette, Video } from "lucide-react";
import {
  PAGE_TRANSITION,
  SOFT_BUTTON_HOVER,
  SOFT_BUTTON_TAP,
  SOFT_CARD_HOVER,
} from "@/lib/motion";

export function CategorySelector({ onCategorySelect, onBack, showBackButton = true }) {
  const categories = [
    {
      id: "music",
      title: "music",
      description: "explore artists publishing singles, EPs, and albums",
      icon: Music,
    },
    {
      id: "visual",
      title: "visual",
      description: "browse illustration, photography, and image-based work",
      icon: Palette,
    },
    {
      id: "video",
      title: "video",
      description: "move through films, motion graphics, and moving-image archives",
      icon: Video,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      {showBackButton && onBack && (
        <motion.button
          onClick={onBack}
          className="mb-8 inline-block touch-manipulation text-gray-400 transition-colors hover:text-white md:mb-12"
          whileHover={{ x: -3, ...SOFT_BUTTON_HOVER }}
          whileTap={SOFT_BUTTON_TAP}
        >
          <span className="inline-block" aria-hidden="true">{"\u2190"}</span>
          <span className="ml-2">back</span>
        </motion.button>
      )}

      <motion.div
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={PAGE_TRANSITION}
        className="mb-12 border border-white/20 p-6 text-center md:mb-16 md:p-12"
      >
        <h2 className="text-3xl tracking-tight md:text-4xl lg:text-5xl">browse artists</h2>
      </motion.div>

      <motion.div
        className="grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-3 md:gap-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...PAGE_TRANSITION, delay: 0.08 }}
      >
        {categories.map((category, index) => {
          const Icon = category.icon;

          return (
            <motion.button
              key={category.id}
              onClick={() => onCategorySelect(category.id)}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...PAGE_TRANSITION, delay: 0.08 * index }}
              className="group relative touch-manipulation active:scale-95"
              whileHover={SOFT_CARD_HOVER}
              whileTap={SOFT_BUTTON_TAP}
            >
              <div className="relative border border-white/10 bg-white/[0.03] p-8 transition-all duration-300 group-hover:border-white/30 group-hover:bg-white/[0.06] md:p-12">
                <motion.div
                  className="mb-4 flex justify-center md:mb-6"
                  whileHover={{ scale: 1.04, rotate: 2 }}
                  transition={PAGE_TRANSITION}
                >
                  <Icon className="h-12 w-12 text-white/80 md:h-16 md:w-16" strokeWidth={1.5} />
                </motion.div>

                <h3 className="mb-2 text-2xl tracking-wide transition-colors group-hover:text-white/90 md:mb-3 md:text-3xl">
                  {category.title}
                </h3>

                <p className="text-xs tracking-wide text-gray-400 md:text-sm">
                  {category.description}
                </p>

                <motion.div
                  className="absolute bottom-0 left-0 right-0 h-px bg-white"
                  initial={{ scaleX: 0 }}
                  whileHover={{ scaleX: 1 }}
                  transition={PAGE_TRANSITION}
                />
              </div>
            </motion.button>
          );
        })}
      </motion.div>
    </div>
  );
}
