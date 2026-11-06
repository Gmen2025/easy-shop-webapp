import { useContext } from 'react'
import { ReviewAvailabilityContext } from '../api/reviews'

export default function RideParticipantProfile({ profile, driver = false }) {
  const { settings } = useContext(ReviewAvailabilityContext)
  if (!profile) return null
  return <div className="ride-participant-profile">
    {profile.profilePhotoUrl ? <img src={profile.profilePhotoUrl} alt={`${profile.name}'s ride photo`} width="64" height="64" /> : <p>No photo provided</p>}
    <strong>{profile.name}</strong>
    <p>{profile.joinedAt ? `Joined ${new Date(profile.joinedAt).toLocaleDateString()}` : 'Joined date unavailable'}</p>
    {settings?.rides && profile.rating ? <p>{profile.rating.count ? `${profile.rating.average.toFixed(1)}/5 (${profile.rating.count} reviews)` : 'No reviews yet'}</p> : null}
    {settings?.rides ? profile.reviews?.map((review) => <p key={review._id}>{review.rating}/5: {review.comment}</p>) : null}
    {driver ? <p>Car: {[profile.vehicleMake, profile.vehicleModel, profile.vehicleType, profile.vehicleColor].filter(Boolean).join(' ') || 'Details not provided'}.
      Plate: {profile.plateNumber || 'Not provided'}</p> : null}
  </div>
}
