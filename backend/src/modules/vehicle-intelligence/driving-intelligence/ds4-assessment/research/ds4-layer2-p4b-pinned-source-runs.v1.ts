import { DS4_LAYER2_P2_PINNED_11_TRIP_IDS_V1 } from './ds4-layer2-p2-pinned-11.attestation.v1';

/** Pinned P2 export source motion runs — must match p2_reconstructed_assessments.csv (no silent revision drift). */
export const DS4_LAYER2_P2_PINNED_11_SOURCE_MOTION_RUNS_V1: Record<
  (typeof DS4_LAYER2_P2_PINNED_11_TRIP_IDS_V1)[number],
  {
    sourceMotionRunId: string;
    contentFingerprint: string;
    speedAuthority: 'C4_ONLY' | 'C5_1_PREFERRED';
    sourceFamily: string;
  }
> = {
  '004f9579-2875-42f2-8aa7-e82c343c954e': {
    sourceMotionRunId: '1787be35-2e5e-42ef-bbf5-a12ee70b92b6',
    contentFingerprint: '9cadd104bf0f088028b5d7e8365700018d90a88db742feffee2d1cb4d8bb8f0b',
    speedAuthority: 'C4_ONLY',
    sourceFamily: 'RUPTELA_R1',
  },
  '0a14d29d-167c-4f28-851b-5c6f6e7f3e5d': {
    sourceMotionRunId: 'e7697f3b-31ca-4927-b812-5013f085f61e',
    contentFingerprint: 'd781b9eef2e4e910121d3949e755cb32209784f4865cb0fdf3bef15c8795e40f',
    speedAuthority: 'C5_1_PREFERRED',
    sourceFamily: 'RUPTELA_R1',
  },
  '2ccf0d2a-d5b8-4612-aabe-b4c1f387d9af': {
    sourceMotionRunId: '34fa59fe-5b2f-4c96-879b-08edb26b7420',
    contentFingerprint: '186e510e338f113990137ddceadb60371c9fe0593238b75f3c9ce29aadd6cb9c',
    speedAuthority: 'C5_1_PREFERRED',
    sourceFamily: 'RUPTELA_R1',
  },
  '3c8827e9-7dd0-46a8-ae7c-eb5c7495c65b': {
    sourceMotionRunId: 'fc0531df-3a60-405f-b850-895dec544783',
    contentFingerprint: 'f5deae7caffcdfea2a046fa1c4914b6a9294a5a57ffeeb983647c43eacf01b41',
    speedAuthority: 'C4_ONLY',
    sourceFamily: 'RUPTELA_R1',
  },
  '4dcc7cbf-9d1c-4efa-b395-6ad540091143': {
    sourceMotionRunId: 'b85f742a-3530-4af7-bc29-c8573218d854',
    contentFingerprint: 'bcad4194d3c774f13e9dc6aba27b91e7c3631a389cd28aa560d2cda0b1489df9',
    speedAuthority: 'C5_1_PREFERRED',
    sourceFamily: 'RUPTELA_R1',
  },
  'b304e9ad-0dcb-4b69-a93e-5364078a20a1': {
    sourceMotionRunId: '95f93536-6911-46df-ad73-10cb19d9197b',
    contentFingerprint: '2f842de6ab7312c7afff5b355024edbbcd95b613fb5f168508fc5aa740b64f14',
    speedAuthority: 'C5_1_PREFERRED',
    sourceFamily: 'API_SYNTHETIC',
  },
  'ba66e2ad-a824-4944-83c9-4472a5508e82': {
    sourceMotionRunId: '9e44c6b4-674d-4786-b46e-89adfd8af54b',
    contentFingerprint: '4455dbcb0a7bdecfec454f25cef9a4fee3666fd3263d15c99d924e4599573785',
    speedAuthority: 'C4_ONLY',
    sourceFamily: 'RUPTELA_R1',
  },
  'c0448fea-e7c3-4658-b2fd-417c452f70d7': {
    sourceMotionRunId: '56599843-8773-432e-a012-85401506b0ab',
    contentFingerprint: 'e5e5b9ddfde732747e468d4b2e6979f8ab07a84020eb19a240dc3b8aa37ba9f3',
    speedAuthority: 'C5_1_PREFERRED',
    sourceFamily: 'RUPTELA_R1',
  },
  'd06f1e85-cf2f-4d7f-88d7-13e5c0a24ac1': {
    sourceMotionRunId: '6409472b-3de9-41b9-8f78-db13e8e417b5',
    contentFingerprint: 'ff4b475a6e31187e2fcb08c2b8506874159d9347d8f41bfdb22db5c1835e4579',
    speedAuthority: 'C4_ONLY',
    sourceFamily: 'RUPTELA_R1',
  },
  'dbdded5c-ee72-40f3-91bb-62d5a1b7f7ff': {
    sourceMotionRunId: '3cca8563-ead8-46a7-bb94-24d71c7bcc07',
    contentFingerprint: 'e8600be4cf50504133fa6ce0bd52b6330a9b2ed62b7c22ff7f3fa81c07da8bf4',
    speedAuthority: 'C5_1_PREFERRED',
    sourceFamily: 'RUPTELA_R1',
  },
  'dfc7c443-d847-4d31-8c84-9c0f11e47e1e': {
    sourceMotionRunId: 'be73d9a0-2946-42b5-bad4-7754d8579af4',
    contentFingerprint: '851a917872b0b31baf35ec4987269ce86bc4ababdb03258bbff2cdb4a355fc06',
    speedAuthority: 'C5_1_PREFERRED',
    sourceFamily: 'API_SYNTHETIC',
  },
};
