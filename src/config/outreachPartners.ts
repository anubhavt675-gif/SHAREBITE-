import wecarePhoto from '../assets/wecare_foundation_outreach.jpg';
import wecareLogo from '../assets/wecare_foundation_logo.png';
import visitSuppliesPhoto from '../assets/outreach/visit_supplies.jpg';
import visitClassroomPhoto from '../assets/outreach/visit_classroom.jpg';
import visitArrivalPhoto from '../assets/outreach/visit_arrival.jpg';
import visitSessionPhoto from '../assets/outreach/visit_session.jpg';

export interface OutreachOrganization {
  id: string;
  name: string;
  eyebrowLabel: string;
  badgeLabel: string;
  description: string;
  ctaLabel: string;
  websiteUrl: string;
  location: string;
  photo: string;
  photoAlt: string;
  logo: string;
  logoAlt: string;
}

export interface OutreachPhotoItem {
  id: string;
  src: string;
  alt: string;
  title: string;
  caption: string;
  location: string;
  objectPosition?: string;
}

export interface OutreachVideoItem {
  id: string;
  src: string;
  poster: string;
  title: string;
  caption: string;
  location: string;
}

export const WE_CARE_FOUNDATION: OutreachOrganization = {
  id: 'we-care-foundation',
  name: 'We Care Foundation',
  eyebrowLabel: 'OUR NGO OUTREACH',
  badgeLabel: 'NGO Outreach Initiative',
  description:
    "As part of ShareBite's journey, our team visited We Care Foundation to understand real-world food distribution challenges and explore ways technology can support communities in need.",
  ctaLabel: 'Visit Foundation Website',
  websiteUrl: 'https://wecarefoundation.in/',
  location: 'Sector 57, Gurugram, Haryana',
  photo: wecarePhoto,
  photoAlt: 'Children enjoying nutritious meals supported by We Care Foundation outreach',
  logo: wecareLogo,
  logoAlt: 'We Care Foundation official logo',
};

export const OUTREACH_PHOTOS: OutreachPhotoItem[] = [
  {
    id: 'visit-classroom',
    src: visitClassroomPhoto,
    alt: 'ShareBite team interacting with students at We Care Foundation classroom in Sector 57, Gurugram',
    title: 'Interactive Session with Students',
    caption: 'Spending time with children at We Care Foundation learning about healthy nutrition and community care.',
    location: 'Sector 57, Gurugram',
    objectPosition: 'center 25%',
  },
  {
    id: 'visit-supplies',
    src: visitSuppliesPhoto,
    alt: 'Boxes of biscuits, snacks, and juice packs arranged for distribution at We Care Foundation',
    title: 'Refreshments & Snack Distribution',
    caption: 'Cartons of biscuits, snacks, and Frooti packs organized and shared with children during our visit.',
    location: 'Block H, Sector 57, Gurugram',
    objectPosition: 'center center',
  },
  {
    id: 'visit-session',
    src: visitSessionPhoto,
    alt: 'ShareBite team explaining the Donor-Rider-NGO workflow on the classroom board at We Care Foundation',
    title: 'Sharing the ShareBite Vision',
    caption: 'Demonstrating how ShareBite connects Donors, Riders, and NGOs (Anna Danam) for zero food waste.',
    location: 'We Care Foundation Center',
    objectPosition: 'center 30%',
  },
  {
    id: 'visit-arrival',
    src: visitArrivalPhoto,
    alt: 'ShareBite team arriving at the We Care Foundation Udaan learning center entrance in Gurugram',
    title: 'Arriving at We Care Foundation',
    caption: 'Our team visiting the Udaan Learning Center in Sector 57, Gurugram for on-ground outreach.',
    location: '1321, Sector 57, Gurugram',
    objectPosition: 'center 42%',
  },
];

export const OUTREACH_VIDEOS: OutreachVideoItem[] = [
  {
    id: 'visit-video-1',
    src: '/media/outreach/wecare_visit_video_1.mp4',
    poster: visitClassroomPhoto,
    title: 'On-Ground Visit & Community Interaction',
    caption: 'Highlights from our team visiting We Care Foundation and engaging with the students and coordinators.',
    location: 'We Care Foundation · Sector 57, Gurugram',
  },
  {
    id: 'visit-video-2',
    src: '/media/outreach/wecare_visit_video_2.mp4',
    poster: visitSuppliesPhoto,
    title: 'Food & Refreshments Distribution Moments',
    caption: 'Real moments from distributing refreshments and understanding ground-level food logistics firsthand.',
    location: 'We Care Foundation · Sector 57, Gurugram',
  },
];
