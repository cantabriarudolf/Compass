## ADDED Requirements

### Requirement: Independent Inventory
Every parking space MUST have a unique identifier and its own technical attributes (Location, Metraje).

#### Scenario: Defining Location
- **WHEN** creating a parking spot
- **THEN** the system MUST allow selecting between "Superficie" or "Subterráneo".

### Requirement: Unit Linking
Parking spots SHOULD be linkable to a physical Unit from the `EF` module, but this link MUST be optional.

#### Scenario: Assigning to Apartment
- **WHEN** editing a parking spot
- **THEN** the system MUST allow searching and selecting a valid Unit (e.g., Depto 101).

### Requirement: Historical Traceability
Any change in the assignment of a parking spot MUST be recorded with a timestamp and the parties involved.

#### Scenario: Reassignment
- **WHEN** a parking spot is moved from Unit 101 to Unit 202
- **THEN** the system MUST close the previous assignment period and open a new one automatically.
