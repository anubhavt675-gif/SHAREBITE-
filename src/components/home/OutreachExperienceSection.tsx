import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Expand,
  Film,
  HeartHandshake,
  MapPin,
  Play,
  X,
} from 'lucide-react';
import {
  OUTREACH_PHOTOS,
  OUTREACH_VIDEOS,
  WE_CARE_FOUNDATION,
  type OutreachVideoItem,
} from '../../config/outreachPartners';
import styles from './OutreachExperienceSection.module.css';

type FilterTab = 'all' | 'photos' | 'videos';

function AutoPlayVisitVideo({ vid }: { vid: OutreachVideoItem }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    el.defaultMuted = true;

    const tryPlay = () => {
      if (el.paused) {
        el.play().catch(() => {});
      }
    };

    tryPlay();

    if (typeof IntersectionObserver !== 'undefined') {
      const obs = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              tryPlay();
            }
          }
        },
        { threshold: 0.2 }
      );
      obs.observe(el);
      return () => obs.disconnect();
    }
  }, [vid.src]);

  return (
    <video
      ref={videoRef}
      className={styles.videoEl}
      src={vid.src}
      poster={vid.poster}
      autoPlay
      loop
      muted
      playsInline
      controls
      preload="auto"
      aria-label={vid.title}
    />
  );
}

export default function OutreachExperienceSection({ compact = false }: { compact?: boolean }) {
  const [tab, setTab] = useState<FilterTab>('all');
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  useEffect(() => {
    if (lightboxIdx === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIdx(null);
      if (e.key === 'ArrowRight') {
        setLightboxIdx((i) => (i === null ? null : (i + 1) % OUTREACH_PHOTOS.length));
      }
      if (e.key === 'ArrowLeft') {
        setLightboxIdx((i) =>
          i === null ? null : (i - 1 + OUTREACH_PHOTOS.length) % OUTREACH_PHOTOS.length
        );
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxIdx]);

  const showVideos = tab === 'all' || tab === 'videos';
  const showPhotos = tab === 'all' || tab === 'photos';
  const activePhoto = lightboxIdx !== null ? OUTREACH_PHOTOS[lightboxIdx] : null;

  return (
    <section
      className={compact ? styles.sectionCompact : styles.section}
      aria-label="ShareBite On-Ground NGO Outreach Experience"
      data-testid="outreach-experience-section"
    >
      <div className={styles.containerCard}>
        <div className={styles.headerRow}>
          <div className={styles.headerLeft}>
            <span className={styles.eyebrow}>
              <HeartHandshake size={13} aria-hidden="true" />
              <span>OUR FIELD EXPERIENCE · {WE_CARE_FOUNDATION.name}</span>
            </span>
            <h2 className={styles.title}>
              Real Moments from Our <span className={styles.titleAccent}>NGO Visit</span>
            </h2>
            <p className={styles.subtitle}>
              Photos and videos from our team's visit to We Care Foundation ({WE_CARE_FOUNDATION.location}) —
              sharing refreshments, interacting with students, and collaborating on technology-driven food rescue.
            </p>
          </div>

          <div className={styles.filterTabs} role="tablist" aria-label="Filter experience media">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'all'}
              className={`${styles.tabBtn} ${tab === 'all' ? styles.tabBtnActive : ''}`}
              onClick={() => setTab('all')}
            >
              All ({OUTREACH_PHOTOS.length + OUTREACH_VIDEOS.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'photos'}
              className={`${styles.tabBtn} ${tab === 'photos' ? styles.tabBtnActive : ''}`}
              onClick={() => setTab('photos')}
            >
              <Camera size={14} aria-hidden="true" /> Photos ({OUTREACH_PHOTOS.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'videos'}
              className={`${styles.tabBtn} ${tab === 'videos' ? styles.tabBtnActive : ''}`}
              onClick={() => setTab('videos')}
            >
              <Film size={14} aria-hidden="true" /> Videos ({OUTREACH_VIDEOS.length})
            </button>
          </div>
        </div>

        {/* VIDEOS SECTION */}
        {showVideos && (
          <div>
            <div className={styles.groupHeader}>
              <h3 className={styles.groupTitle}>
                <Film size={17} color="#BF5B27" aria-hidden="true" /> Visit Videos
              </h3>
              <span className={styles.groupCount}>{OUTREACH_VIDEOS.length} real clips</span>
            </div>

            <div className={styles.videosGrid}>
              {OUTREACH_VIDEOS.map((vid) => (
                <article key={vid.id} className={styles.videoCard}>
                  <div className={styles.videoPlayerWrap}>
                    <AutoPlayVisitVideo vid={vid} />
                    <span className={styles.videoBadge}>
                      <Play size={11} fill="currentColor" aria-hidden="true" /> Field Visit Video
                    </span>
                  </div>
                  <div className={styles.mediaBody}>
                    <h4 className={styles.mediaTitle}>{vid.title}</h4>
                    <p className={styles.mediaCaption}>{vid.caption}</p>
                    <span className={styles.mediaLocation}>
                      <MapPin size={12} aria-hidden="true" /> {vid.location}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {/* PHOTOS SECTION */}
        {showPhotos && (
          <div>
            <div className={styles.groupHeader}>
              <h3 className={styles.groupTitle}>
                <Camera size={17} color="#BF5B27" aria-hidden="true" /> Visit Photos
              </h3>
              <span className={styles.groupCount}>Click any photo to view full size</span>
            </div>

            <div className={styles.photosGrid}>
              {OUTREACH_PHOTOS.map((photo, idx) => (
                <button
                  key={photo.id}
                  type="button"
                  className={styles.photoCard}
                  onClick={() => setLightboxIdx(idx)}
                  aria-label={`View full-size photo: ${photo.title}`}
                >
                  <div className={styles.photoThumbWrap}>
                    <img
                      src={photo.src}
                      alt={photo.alt}
                      className={styles.photoImg}
                      style={{ objectPosition: photo.objectPosition || 'center' }}
                      loading="lazy"
                      decoding="async"
                      width={400}
                      height={300}
                    />
                    <span className={styles.zoomHint} aria-hidden="true">
                      <Expand size={14} />
                    </span>
                  </div>
                  <div className={styles.photoBody}>
                    <h4 className={styles.photoTitle}>{photo.title}</h4>
                    <p className={styles.photoCaption}>{photo.caption}</p>
                    <span className={styles.mediaLocation}>
                      <MapPin size={11} aria-hidden="true" /> {photo.location}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* LIGHTBOX MODAL */}
      {activePhoto && lightboxIdx !== null && (
        <div
          className={styles.lightboxOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={activePhoto.title}
          onClick={() => setLightboxIdx(null)}
        >
          <div className={styles.lightboxDialog} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.lightboxClose}
              onClick={() => setLightboxIdx(null)}
              aria-label="Close photo preview"
            >
              <X size={18} />
            </button>
            <button
              type="button"
              className={`${styles.lightboxNavBtn} ${styles.lightboxPrev}`}
              onClick={() =>
                setLightboxIdx((lightboxIdx - 1 + OUTREACH_PHOTOS.length) % OUTREACH_PHOTOS.length)
              }
              aria-label="Previous photo"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              className={`${styles.lightboxNavBtn} ${styles.lightboxNext}`}
              onClick={() => setLightboxIdx((lightboxIdx + 1) % OUTREACH_PHOTOS.length)}
              aria-label="Next photo"
            >
              <ChevronRight size={20} />
            </button>

            <div className={styles.lightboxImgWrap}>
              <img
                src={activePhoto.src}
                alt={activePhoto.alt}
                className={styles.lightboxImg}
              />
            </div>

            <div className={styles.lightboxMeta}>
              <div>
                <h4 className={styles.mediaTitle}>{activePhoto.title}</h4>
                <p className={styles.mediaCaption}>{activePhoto.caption}</p>
              </div>
              <span className={styles.mediaLocation}>
                <MapPin size={12} aria-hidden="true" /> {activePhoto.location} ({lightboxIdx + 1}/{OUTREACH_PHOTOS.length})
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
